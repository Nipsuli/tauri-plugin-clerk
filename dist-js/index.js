import { Clerk } from "@clerk/clerk-js";
import { loadClerkUIScript } from "@clerk/shared/loadClerkJsScript";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";

//#region guest-js/logger.ts
/**
* Default logger to log to console
*/
const consoleLogger = () => ({
	debug: (params, message) => console.debug(message, params),
	info: (params, message) => console.info(message, params),
	warn: (params, message) => console.warn(message, params),
	error: ({ error,...params }, message) => console.error(message, error, params)
});
/**
* To mute internal logs
*/
const noopLogger = () => ({
	debug: (_params, _message) => {},
	info: (_params, _message) => {},
	warn: (_params, _message) => {},
	error: (_params, _message) => {}
});
const toError = (error) => {
	if (error instanceof Error) return error;
	else if (typeof error === "string") return new Error(error);
	else return new Error(JSON.stringify(error));
};
let logger = consoleLogger();
const logError = (message) => (error) => logger.error({ error: toError(error) }, message);
const setLogger = (newLogger) => {
	logger = newLogger;
};

//#endregion
//#region guest-js/sync.ts
const __internalWindowLabel = getCurrentWindow().label;
const CLERK_AUTH_EVENT_NAME = "plugin-clerk-auth-cb";
const shouldUpdate = (oldClient, newClient) => {
	if (!oldClient) return true;
	if (oldClient.id !== newClient.id) return true;
	if (oldClient.lastActiveSessionId !== newClient.last_active_session_id) return true;
	const oldSessionIds = oldClient.sessions.map((session) => session.id).toSorted();
	const newSessionIds = newClient.sessions.map((session) => session.id).toSorted();
	if (oldSessionIds.length !== newSessionIds.length) return true;
	for (let i = 0; i < oldSessionIds.length; i++) if (oldSessionIds[i] !== newSessionIds[i]) return true;
	return false;
};
const initListener = async (clerk) => {
	await listen(CLERK_AUTH_EVENT_NAME, (event) => {
		const authEvent = event.payload;
		if (authEvent.source !== __internalWindowLabel) {
			logger.debug({}, "Plugin:clerk: received auth state change");
			if (shouldUpdate(clerk.client, authEvent.payload.client)) logger.debug({}, "Plugin:clerk: refreshing session");
		}
	});
};
const emitClerkAuthEvent = (payload) => {
	logger.debug({}, "Plugin:clerk: emitting auth state change");
	emit(CLERK_AUTH_EVENT_NAME, {
		source: __internalWindowLabel,
		payload
	}).catch(logError("Plugin:clerk: failed to emit auth event"));
};
const getInitArgs = () => invoke("plugin:clerk|initialize");
const getClientJWT = () => invoke("plugin:clerk|get_client_authorization_header");
const saveClientJWT = async (header) => {
	await invoke("plugin:clerk|set_client_authorization_header", { header });
};

//#endregion
//#region guest-js/patching.ts
const realFetch = globalThis.fetch;
const urlForRequestInput = (input) => typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
const runTauriFetch = async (input, init) => {
	return await fetch(new Request(input, init));
};
const shouldRunTauriFetch = (input, init) => {
	const initHeaders = init?.headers;
	if (initHeaders) if (initHeaders instanceof Headers) return initHeaders.has("x-tauri-fetch");
	else if (Array.isArray(initHeaders)) return initHeaders.some((h) => h[0] === "x-tauri-fetch");
	else return !!initHeaders["x-tauri-fetch"];
	if (input instanceof Request) return input.headers.has("x-tauri-fetch");
	return false;
};
const parseTauriFetchBody = (obj) => {
	if (obj && typeof obj === "object" && obj !== null && "clientConfig" in obj && typeof obj.clientConfig === "object" && obj.clientConfig !== null && !Array.isArray(obj.clientConfig)) return obj;
	throw new Error("Invalid Tauri Fetch Body: no clientConfig");
};
const getHeadersFromTauriFetchBody = (body) => {
	if ("headers" in body.clientConfig && Array.isArray(body.clientConfig.headers) && body.clientConfig.headers.every((v) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string")) return body.clientConfig.headers;
	throw new Error("Invalid Tauri Fetch Body: no headers");
};
const runRealFetch = async (input, init) => {
	const url = urlForRequestInput(input);
	const shouldInjectHeaders = decodeURIComponent(url.pathname) === "/plugin:http|fetch";
	let initToPass = init;
	if (shouldInjectHeaders && typeof init?.body === "string") {
		const body = parseTauriFetchBody(JSON.parse(init.body));
		const existingHeaders = getHeadersFromTauriFetchBody(body);
		if (existingHeaders) {
			const headers = [...existingHeaders, ["User-Agent", window.navigator.userAgent]];
			if (existingHeaders.some((h) => h[0] === "x-no-origin")) headers.push(["Origin", ""]);
			else headers.push(["Origin", window.location.origin]);
			initToPass = {
				...init,
				body: JSON.stringify({
					body,
					clientConfig: {
						...body.clientConfig,
						headers
					}
				})
			};
		}
	}
	return await realFetch(input, initToPass);
};
const patchFetch = async (input, init) => {
	if (shouldRunTauriFetch(input, init)) return await runTauriFetch(input, init);
	else return await runRealFetch(input, init);
};
let __internalIsPatched = false;
const applyGlobalPatches = () => {
	if (__internalIsPatched) return;
	__internalIsPatched = true;
	globalThis.fetch = patchFetch;
};

//#endregion
//#region guest-js/clerk-utils.ts
const RUST_SUPPORTED_IDENTIFICATION_LINK_TYPES = new Set([
	"oauth_apple",
	"oauth_google",
	"oauth_mock",
	"oauth_custom_mock",
	"saml"
]);
const RUST_SUPPORTED_SESSION_STATUSES = new Set([
	"active",
	"revoked",
	"ended",
	"expired",
	"removed",
	"abandoned",
	"pending"
]);
const toUnixTimestamp = (date) => date ? Math.floor(date.getTime() / 1e3) : 0;
const toNullableUnixTimestamp = (date) => date ? toUnixTimestamp(date) : null;
const resourceTimestamps = (resource) => {
	const timestamped = resource;
	return {
		created_at: toUnixTimestamp(timestamped.createdAt),
		updated_at: toUnixTimestamp(timestamped.updatedAt)
	};
};
const clerkIdentificationLinksToJSON = (links) => links.filter((link) => RUST_SUPPORTED_IDENTIFICATION_LINK_TYPES.has(link.type)).map((link) => ({
	object: "",
	id: link.id,
	type: link.type
}));
const clerkClientToClientJSON = (client) => ({
	object: "client",
	id: client.id,
	sessions: client.sessions.filter((session) => RUST_SUPPORTED_SESSION_STATUSES.has(session.status)).map((session) => clerkSessionToSessionJSON(session)),
	sign_up: null,
	sign_in: null,
	captcha_bypass: client.captchaBypass,
	last_active_session_id: client.lastActiveSessionId,
	last_authentication_strategy: client.lastAuthenticationStrategy,
	cookie_expires_at: client.cookieExpiresAt ? toUnixTimestamp(client.cookieExpiresAt) : null,
	created_at: toUnixTimestamp(client.createdAt),
	updated_at: toUnixTimestamp(client.updatedAt)
});
const clerkSessionToSessionJSON = (session) => ({
	object: "session",
	id: session.id,
	status: session.status,
	factor_verification_age: session.factorVerificationAge ?? [],
	expire_at: toUnixTimestamp(session.expireAt),
	abandon_at: toUnixTimestamp(session.abandonAt),
	last_active_at: toUnixTimestamp(session.lastActiveAt),
	last_active_token: session.lastActiveToken ? {
		object: "token",
		id: session.lastActiveToken.id,
		jwt: session.lastActiveToken.getRawString()
	} : null,
	last_active_organization_id: session.lastActiveOrganizationId,
	actor: session.actor,
	tasks: session.tasks,
	user: session.user ? clerkUserToUserJSON(session.user) : null,
	public_user_data: clerkPublicUserDataToPublicUserDataJSON(session.publicUserData),
	created_at: toUnixTimestamp(session.createdAt),
	updated_at: toUnixTimestamp(session.updatedAt)
});
const clerkEmailAddressToEmailAdressJSON = (emailAddress) => ({
	object: "email_address",
	id: emailAddress.id,
	email_address: emailAddress.emailAddress,
	linked_to: clerkIdentificationLinksToJSON(emailAddress.linkedTo),
	matches_sso_connection: emailAddress.matchesSsoConnection,
	reserved: false,
	...resourceTimestamps(emailAddress),
	verification: null
});
const clerkPhoneNumberToPhoneNumberJSON = (phoneNumber) => ({
	object: "phone_number",
	id: phoneNumber.id,
	phone_number: phoneNumber.phoneNumber,
	reserved_for_second_factor: phoneNumber.reservedForSecondFactor,
	default_second_factor: phoneNumber.defaultSecondFactor,
	linked_to: clerkIdentificationLinksToJSON(phoneNumber.linkedTo),
	reserved: false,
	...resourceTimestamps(phoneNumber),
	verification: null,
	backup_codes: phoneNumber.backupCodes
});
const clerkWeb3WalletToWeb3WalletJSON = (web3Wallet) => ({
	object: "web3_wallet",
	id: web3Wallet.id,
	web3_wallet: web3Wallet.web3Wallet,
	...resourceTimestamps(web3Wallet),
	verification: null
});
const clerkExternalAccountToExternalAccountJSON = (externalAccount) => ({
	object: "external_account",
	id: externalAccount.id,
	provider: externalAccount.provider,
	identification_id: externalAccount.identificationId,
	provider_user_id: externalAccount.providerUserId,
	approved_scopes: externalAccount.approvedScopes,
	email_address: externalAccount.emailAddress,
	first_name: externalAccount.firstName,
	last_name: externalAccount.lastName,
	image_url: externalAccount.imageUrl,
	username: externalAccount.username ?? "",
	phone_number: externalAccount.phoneNumber ?? "",
	public_metadata: externalAccount.publicMetadata,
	label: externalAccount.label ?? "",
	...resourceTimestamps(externalAccount),
	verification: null
});
const clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON = (enterpriseAccountConnection) => ({
	object: "enterprise_account_connection",
	id: enterpriseAccountConnection.id ?? "",
	active: enterpriseAccountConnection.active,
	allow_idp_initiated: enterpriseAccountConnection.allowIdpInitiated,
	allow_subdomains: enterpriseAccountConnection.allowSubdomains,
	disable_additional_identifications: enterpriseAccountConnection.disableAdditionalIdentifications,
	allow_organization_account_linking: enterpriseAccountConnection.allowOrganizationAccountLinking,
	domain: enterpriseAccountConnection.domain,
	logo_public_url: enterpriseAccountConnection.logoPublicUrl,
	name: enterpriseAccountConnection.name,
	protocol: enterpriseAccountConnection.protocol,
	provider: enterpriseAccountConnection.provider,
	sync_user_attributes: enterpriseAccountConnection.syncUserAttributes,
	created_at: 0,
	updated_at: 0,
	enterprise_connection_id: enterpriseAccountConnection.enterpriseConnectionId
});
const clerkEnterpriseAccountToEnterpriseAccountJSON = (enterpriseAccount) => ({
	object: "enterprise_account",
	id: enterpriseAccount.id ?? "",
	active: enterpriseAccount.active ?? false,
	email_address: enterpriseAccount.emailAddress ?? "",
	enterprise_connection: enterpriseAccount.enterpriseConnection ? clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON(enterpriseAccount.enterpriseConnection) : null,
	first_name: enterpriseAccount.firstName ?? "",
	last_name: enterpriseAccount.lastName ?? "",
	protocol: enterpriseAccount.protocol,
	provider: enterpriseAccount.provider,
	provider_user_id: enterpriseAccount.providerUserId ?? "",
	public_metadata: enterpriseAccount.publicMetadata ?? {},
	verification: null,
	enterprise_connection_id: enterpriseAccount.enterpriseConnectionId,
	last_authenticated_at: enterpriseAccount.lastAuthenticatedAt ? toUnixTimestamp(enterpriseAccount.lastAuthenticatedAt) : null
});
const clerkPasskeyToPasskeyJSON = (passkey) => ({
	object: "passkey",
	id: passkey.id,
	name: passkey.name,
	verification: null,
	last_used_at: toNullableUnixTimestamp(passkey.lastUsedAt),
	updated_at: toUnixTimestamp(passkey.createdAt),
	created_at: toUnixTimestamp(passkey.createdAt)
});
const clerkPublicUserDataToPublicUserDataJSON = (publicUserData) => {
	const res = {
		first_name: publicUserData?.firstName ?? "",
		last_name: publicUserData?.lastName ?? "",
		image_url: publicUserData?.imageUrl ?? "",
		has_image: publicUserData?.hasImage ?? false,
		identifier: publicUserData?.identifier ?? ""
	};
	if (publicUserData?.userId) res["user_id"] = publicUserData.userId;
	return res;
};
const clerkOrganizationMembershipToOrganizationMembershipJSON = (organizationMembership) => ({
	object: "organization_membership",
	id: organizationMembership.id,
	organization: clerkOrganizationToOrganizationJSON(organizationMembership.organization),
	permissions: organizationMembership.permissions,
	public_metadata: organizationMembership.publicMetadata,
	public_user_data: clerkPublicUserDataToPublicUserDataJSON(organizationMembership.publicUserData),
	role: organizationMembership.role,
	role_name: organizationMembership.roleName,
	created_at: toUnixTimestamp(organizationMembership.createdAt),
	updated_at: toUnixTimestamp(organizationMembership.updatedAt)
});
const clerkUserToUserJSON = (user) => {
	const compatibility = user;
	return {
		object: "user",
		id: user.id,
		external_id: user.externalId,
		primary_email_address_id: user.primaryEmailAddressId,
		primary_phone_number_id: user.primaryPhoneNumberId,
		primary_web3_wallet_id: user.primaryWeb3WalletId,
		image_url: user.imageUrl,
		has_image: user.hasImage,
		username: user.username,
		email_addresses: user.emailAddresses.map(clerkEmailAddressToEmailAdressJSON),
		phone_numbers: user.phoneNumbers.map(clerkPhoneNumberToPhoneNumberJSON),
		web3_wallets: user.web3Wallets.map(clerkWeb3WalletToWeb3WalletJSON),
		external_accounts: user.externalAccounts.map(clerkExternalAccountToExternalAccountJSON),
		enterprise_accounts: user.enterpriseAccounts.map(clerkEnterpriseAccountToEnterpriseAccountJSON),
		passkeys: user.passkeys.map(clerkPasskeyToPasskeyJSON),
		organization_memberships: user.organizationMemberships.map(clerkOrganizationMembershipToOrganizationMembershipJSON),
		saml_accounts: [],
		password_enabled: user.passwordEnabled,
		profile_image_id: user.imageUrl,
		first_name: user.firstName,
		last_name: user.lastName,
		totp_enabled: user.totpEnabled,
		backup_code_enabled: user.backupCodeEnabled,
		two_factor_enabled: user.twoFactorEnabled,
		public_metadata: user.publicMetadata,
		unsafe_metadata: user.unsafeMetadata,
		last_sign_in_at: toNullableUnixTimestamp(user.lastSignInAt),
		banned: compatibility.banned ?? false,
		locked: compatibility.locked ?? false,
		lockout_expires_in_seconds: compatibility.lockoutExpiresInSeconds ?? null,
		verification_attempts_remaining: compatibility.verificationAttemptsRemaining ?? null,
		last_active_at: toNullableUnixTimestamp(compatibility.lastActiveAt),
		mfa_enabled_at: toNullableUnixTimestamp(compatibility.mfaEnabledAt),
		mfa_disabled_at: toNullableUnixTimestamp(compatibility.mfaDisabledAt),
		create_organization_enabled: user.createOrganizationEnabled,
		create_organizations_limit: user.createOrganizationsLimit,
		delete_self_enabled: user.deleteSelfEnabled,
		legal_accepted_at: toNullableUnixTimestamp(user.legalAcceptedAt),
		updated_at: toUnixTimestamp(user.updatedAt),
		created_at: toUnixTimestamp(user.createdAt)
	};
};
const clerkOrganizationToOrganizationJSON = (organization) => ({
	object: "organization",
	id: organization.id,
	image_url: organization.imageUrl,
	has_image: organization.hasImage,
	name: organization.name,
	slug: organization.slug ?? "",
	public_metadata: organization.publicMetadata,
	created_at: toUnixTimestamp(organization.createdAt),
	updated_at: toUnixTimestamp(organization.updatedAt),
	members_count: organization.membersCount,
	pending_invitations_count: organization.pendingInvitationsCount,
	admin_delete_enabled: organization.adminDeleteEnabled,
	max_allowed_memberships: organization.maxAllowedMemberships
});

//#endregion
//#region package.json
var name = "tauri-plugin-clerk";
var version = "0.1.1";

//#endregion
//#region guest-js/index.ts
const sdkMetadata = {
	name,
	version
};
let __internalClerk = null;
const initClerk = async (initArgs, intLogger) => {
	applyGlobalPatches();
	if (intLogger) setLogger(intLogger);
	const { client, environment, publishableKey } = await getInitArgs();
	const isNewInstance = !__internalClerk;
	__internalClerk ??= new Clerk(publishableKey);
	if (isNewInstance) {
		await initListener(__internalClerk);
		__internalClerk.addListener(({ client: client$1, session, user, organization }) => {
			emitClerkAuthEvent({
				client: clerkClientToClientJSON(client$1),
				session: session ? clerkSessionToSessionJSON(session) : null,
				user: user ? clerkUserToUserJSON(user) : null,
				organization: organization ? clerkOrganizationToOrganizationJSON(organization) : null
			});
		});
	}
	__internalClerk.__internal_getCachedResources = async () => ({
		client,
		environment
	});
	let clerkUI;
	try {
		await loadClerkUIScript({ publishableKey });
		clerkUI = window.__internal_ClerkUICtor;
	} catch (e) {
		logger.warn({ error: e }, "Plugin:clerk: Failed to load Clerk UI components from CDN. Pre-built UI components (SignIn, UserButton, etc.) will not be available.");
	}
	__internalClerk.__internal_onBeforeRequest(async (requestInit) => {
		requestInit.credentials = "omit";
		requestInit.url?.searchParams.append("_is_native", "1");
		const jwt = await getClientJWT();
		requestInit.headers.set("authorization", jwt || "");
		requestInit.headers.set("x-mobile", "1");
		requestInit.headers.set("x-no-origin", "1");
		requestInit.headers.set("x-tauri-fetch", "1");
	});
	__internalClerk.__internal_onAfterResponse(async (_, response) => {
		if (!response) {
			logger.warn({}, "No response in Fapi call");
			return;
		}
		const header = response.headers.get("authorization");
		if (header) await saveClientJWT(header);
		if ("native_api_disabled" === response.payload?.errors?.[0]?.code) console.error("The Native API is disabled for this instance.\n", "Go to Clerk Dashboard > Configure > Native applications to enable it.\n", "Or, navigate here: https://dashboard.clerk.com/last-active?path=native-applications");
	});
	const loadOptions = {
		...initArgs,
		sdkMetadata,
		standardBrowser: false
	};
	if (clerkUI) loadOptions.ui = { ClerkUI: clerkUI };
	await __internalClerk.load(loadOptions);
	return __internalClerk;
};

//#endregion
export { consoleLogger, initClerk, noopLogger };