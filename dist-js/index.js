import { Clerk } from "@clerk/clerk-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import z from "zod";
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
const shouldUpdate = (_oldClient, _newClient) => {
	return true;
};
const updateClerkClient = (clerk, oldClient, newClient) => {
	clerk.updateClient(oldClient.fromJSON(newClient));
};
const initListener = async (clerk) => {
	await listen(CLERK_AUTH_EVENT_NAME, (event) => {
		const authEvent = event.payload;
		if (authEvent.source !== __internalWindowLabel) {
			logger.debug({ authEvent }, "Plugin:clerk: received auth event");
			const oldClient = clerk.client;
			if (oldClient && shouldUpdate(oldClient, authEvent.payload.client)) updateClerkClient(clerk, oldClient, authEvent.payload.client);
		}
	});
};
const emitClerkAuthEvent = (payload) => {
	logger.debug({ payload }, "Plugin:clerk: emitting auth event");
	emit(CLERK_AUTH_EVENT_NAME, {
		source: __internalWindowLabel,
		payload
	}).catch(logError("Plugin:clerk: failed to emit auth event"));
};
const getInitArgs = () => invoke("plugin:clerk|initialize");
const getClientJWT = () => invoke("plugin:clerk|get_client_authorization_header");
const saveClientJWT = (header) => invoke("plugin:clerk|set_client_authorization_header", { header });

//#endregion
//#region guest-js/patching.ts
const realFetch = globalThis.fetch;
const RequestInitSchema = z.object({ clientConfig: z.object({
	url: z.string(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	method: z.string(),
	data: z.any(),
	maxRedirections: z.any(),
	connectTimeout: z.any(),
	proxy: z.any()
}) }).strict();
const urlForRequestInput = (input) => typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
const runTauriFetch = async (input, init$1) => {
	const req = new Request(input, init$1);
	const res = await fetch(req);
	return res;
};
const shouldRunTauriFetch = (input, init$1) => {
	const initHeaders = init$1?.headers;
	if (initHeaders) if (initHeaders instanceof Headers) return initHeaders.has("x-tauri-fetch");
	else if (Array.isArray(initHeaders)) return initHeaders.some((h) => h[0] === "x-tauri-fetch");
	else return !!initHeaders["x-tauri-fetch"];
	if (input instanceof Request) return input.headers.has("x-tauri-fetch");
	return false;
};
const runRealFetch = async (input, init$1) => {
	const url = urlForRequestInput(input);
	const path = decodeURIComponent(url.pathname);
	const shouldInjectHeaders = path === "/plugin:http|fetch";
	let initToPass = init$1;
	if (shouldInjectHeaders && typeof init$1?.body === "string") {
		const rawBody = JSON.parse(init$1.body);
		const body = RequestInitSchema.parse(rawBody);
		const headers = [...body.clientConfig.headers, ["User-Agent", window.navigator.userAgent]];
		if (body.clientConfig.headers.some((h) => h[0] === "x-no-origin")) headers.push(["Origin", ""]);
		else headers.push(["Origin", window.location.origin]);
		initToPass = {
			...init$1,
			body: JSON.stringify({
				...body,
				clientConfig: {
					...body.clientConfig,
					headers
				}
			})
		};
	}
	const res = await realFetch(input, initToPass);
	return res;
};
const patchFetch = async (input, init$1) => {
	if (shouldRunTauriFetch(input, init$1)) return await runTauriFetch(input, init$1);
	else return await runRealFetch(input, init$1);
};
let __internalIsPatched = false;
const applyGlobalPatches = () => {
	if (__internalIsPatched) return;
	__internalIsPatched = true;
	globalThis.fetch = patchFetch;
};

//#endregion
//#region guest-js/clerk-utils.ts
const clerkSignUpToSignUpJSON = (signUp) => ({
	object: "sign_up",
	id: signUp.id,
	status: signUp.status,
	required_fields: signUp.requiredFields,
	optional_fields: signUp.optionalFields,
	missing_fields: signUp.missingFields,
	unverified_fields: signUp.unverifiedFields,
	username: signUp.username,
	first_name: signUp.firstName,
	last_name: signUp.lastName,
	email_address: signUp.emailAddress,
	phone_number: signUp.phoneNumber,
	web3_wallet: signUp.web3wallet,
	external_account_strategy: null,
	external_account: null,
	has_password: signUp.hasPassword,
	unsafe_metadata: signUp.unsafeMetadata,
	created_session_id: signUp.createdSessionId,
	created_user_id: signUp.createdUserId,
	abandon_at: signUp.abandonAt,
	legal_accepted_at: signUp.legalAcceptedAt,
	verifications: null
});
const strFromCamelToSnake = (str) => {
	if (!str) return "";
	return str.replace(/[A-Z]/g, (match, offset) => {
		if (offset === 0) return match.toLowerCase();
		else return `_${match.toLowerCase()}`;
	});
};
const camelToSnake = (obj) => {
	const res = {};
	for (const [key, value] of Object.entries(obj)) res[strFromCamelToSnake(key)] = value;
	return res;
};
const clerkSignInToSignInJSON = (signIn) => ({
	object: "sign_in",
	id: signIn.id,
	status: signIn.status,
	supported_identifiers: [],
	identifier: signIn.identifier,
	user_data: {
		first_name: signIn.userData?.firstName ?? "",
		last_name: signIn.userData?.lastName ?? "",
		image_url: signIn.userData?.imageUrl ?? "",
		has_image: signIn.userData?.hasImage ?? false
	},
	supported_first_factors: signIn.supportedFirstFactors?.map(camelToSnake) ?? [],
	supported_second_factors: signIn.supportedSecondFactors?.map(camelToSnake) ?? [],
	first_factor_verification: null,
	second_factor_verification: null,
	created_session_id: signIn.createdSessionId
});
const clerkClientToClientJSON = (client) => ({
	object: "client",
	id: client.id,
	sessions: client.sessions.map(clerkSessionToSessionJSON),
	sign_up: client.signUp ? clerkSignUpToSignUpJSON(client.signUp) : null,
	sign_in: client.signIn ? clerkSignInToSignInJSON(client.signIn) : null,
	captcha_bypass: client.captchaBypass,
	last_active_session_id: client.lastActiveSessionId,
	cookie_expires_at: client.cookieExpiresAt ? client.cookieExpiresAt.getTime() / 1e3 : null,
	created_at: client.createdAt ? client.createdAt.getTime() / 1e3 : 0,
	updated_at: client.updatedAt ? client.updatedAt.getTime() / 1e3 : 0
});
const clerkSessionToSessionJSON = (session) => ({
	object: "session",
	id: session.id,
	status: session.status,
	factor_verification_age: session.factorVerificationAge,
	expire_at: session.expireAt.getTime() / 1e3,
	abandon_at: session.abandonAt.getTime() / 1e3,
	last_active_at: session.lastActiveAt.getTime() / 1e3,
	last_active_token: {
		object: "token",
		id: session.lastActiveToken.id,
		jwt: session.lastActiveToken.getRawString()
	},
	last_active_organization_id: session.lastActiveOrganizationId,
	actor: session.actor,
	tasks: session.tasks,
	user: clerkUserToUserJSON(session.user),
	public_user_data: clerkPublicUserDataToPublicUserDataJSON(session.publicUserData),
	created_at: session.createdAt.getTime() / 1e3,
	updated_at: session.updatedAt.getTime() / 1e3
});
const clerkEmailAddressToEmailAdressJSON = (emailAddress) => ({
	object: "email_address",
	id: emailAddress.id,
	email_address: emailAddress.emailAddress,
	linked_to: emailAddress.linkedTo.map((l) => ({
		object: "",
		id: l.id,
		type: l.type
	})),
	matches_sso_connection: emailAddress.matchesSsoConnection,
	verification: null
});
const clerkPhoneNumberToPhoneNumberJSON = (phoneNumber) => ({
	object: "phone_number",
	id: phoneNumber.id,
	phone_number: phoneNumber.phoneNumber,
	reserved_for_second_factor: phoneNumber.reservedForSecondFactor,
	default_second_factor: phoneNumber.defaultSecondFactor,
	linked_to: phoneNumber.linkedTo.map((l) => ({
		object: "",
		id: l.id,
		type: l.type
	})),
	verification: null
});
const clerkWeb3WalletToWeb3WalletJSON = (web3Wallet) => ({
	object: "web3_wallet",
	id: web3Wallet.id,
	web3_wallet: web3Wallet.web3Wallet,
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
	label: externalAccount.label ?? ""
});
const clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON = (enterpriseAccountConnection) => ({
	object: "enterprise_account_connection",
	id: enterpriseAccountConnection.id ?? "",
	active: enterpriseAccountConnection.active,
	allow_idp_initiated: enterpriseAccountConnection.allowIdpInitiated,
	allow_subdomains: enterpriseAccountConnection.allowSubdomains,
	disable_additional_identifications: enterpriseAccountConnection.disableAdditionalIdentifications,
	domain: enterpriseAccountConnection.domain,
	logo_public_url: enterpriseAccountConnection.logoPublicUrl,
	name: enterpriseAccountConnection.name,
	protocol: enterpriseAccountConnection.protocol,
	provider: enterpriseAccountConnection.provider,
	sync_user_attributes: enterpriseAccountConnection.syncUserAttributes,
	created_at: 0,
	updated_at: 0
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
	verification: null
});
const clerkPasskeyToPasskeyJSON = (passkey) => ({
	object: "passkey",
	id: passkey.id,
	name: passkey.name,
	verification: null,
	last_used_at: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() / 1e3 : null,
	updated_at: passkey.createdAt.getTime() / 1e3,
	created_at: passkey.createdAt.getTime() / 1e3
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
	created_at: organizationMembership.createdAt.getTime() / 1e3,
	updated_at: organizationMembership.updatedAt.getTime() / 1e3
});
const clerkUserToUserJSON = (user) => ({
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
	saml_accounts: [],
	organization_memberships: user.organizationMemberships.map(clerkOrganizationMembershipToOrganizationMembershipJSON),
	password_enabled: user.passwordEnabled,
	profile_image_id: user.imageUrl,
	first_name: user.firstName,
	last_name: user.lastName,
	totp_enabled: user.totpEnabled,
	backup_code_enabled: user.backupCodeEnabled,
	two_factor_enabled: user.twoFactorEnabled,
	public_metadata: user.publicMetadata,
	unsafe_metadata: user.unsafeMetadata,
	last_sign_in_at: user.lastSignInAt ? user.lastSignInAt.getTime() / 1e3 : null,
	create_organization_enabled: user.createOrganizationEnabled,
	create_organizations_limit: user.createOrganizationsLimit,
	delete_self_enabled: user.deleteSelfEnabled,
	legal_accepted_at: null,
	updated_at: user.updatedAt ? user.updatedAt.getTime() / 1e3 : 0,
	created_at: user.createdAt ? user.createdAt.getTime() / 1e3 : 0
});
const clerkOrganizationToOrganizationJSON = (organization) => ({
	object: "organization",
	id: organization.id,
	image_url: organization.imageUrl,
	has_image: organization.hasImage,
	name: organization.name,
	slug: organization.slug ?? "",
	public_metadata: organization.publicMetadata,
	created_at: organization.createdAt.getTime() / 1e3,
	updated_at: organization.updatedAt.getTime() / 1e3,
	members_count: organization.membersCount,
	pending_invitations_count: organization.membersCount,
	admin_delete_enabled: organization.adminDeleteEnabled,
	max_allowed_memberships: organization.maxAllowedMemberships
});

//#endregion
//#region package.json
var name = "tauri-plugin-clerk";
var version = "0.1.0";
var author = "@Nipsuli";
var description = "";
var type = "module";
var types = "./dist-js/index.d.ts";
var main = "./dist-js/index.js";
var module = "./dist-js/index.js";
var exports = {
	"types": "./dist-js/index.d.ts",
	"import": "./dist-js/index.js"
};
var files = ["dist-js", "README.md"];
var scripts = {
	"build": "tsdown",
	"dev:js": "tsdown --watch ./guest-js",
	"prepublishOnly": "npm build",
	"pretest": "npm build",
	"format": "prettier --write \"guest-js/**/*.ts\"",
	"checks:format": "prettier --check \"guest-js/**/*.ts\"",
	"checks:types": "tsc --noEmit",
	"checks:lint": "oxlint guest-js",
	"checks": "run-p checks:*"
};
var dependencies = {
	"@clerk/clerk-js": "^5.67.2",
	"@clerk/types": "^4.59.0",
	"@tauri-apps/api": ">=2.5.0",
	"@tauri-apps/plugin-http": "^2.4.4",
	"zod": "^3.25.23"
};
var devDependencies = {
	"npm-run-all": "^4.1.5",
	"oxlint": "^0.16.11",
	"prettier": "^3.5.3",
	"tsdown": "^0.12.2",
	"tslib": "^2.6.2",
	"typescript": "^5.3.3"
};
var package_default = {
	name,
	version,
	author,
	description,
	type,
	types,
	main,
	module,
	exports,
	files,
	scripts,
	dependencies,
	devDependencies
};

//#endregion
//#region guest-js/index.ts
const sdkMetadata = {
	name: package_default.name,
	version: package_default.version
};
let __internalClerk = null;
const init = async (initArgs, intLogger) => {
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
	__internalClerk.__unstable__onBeforeRequest(async (requestInit) => {
		requestInit.credentials = "omit";
		requestInit.url?.searchParams.append("_is_native", "1");
		const jwt = await getClientJWT();
		requestInit.headers.set("authorization", jwt || "");
		requestInit.headers.set("x-mobile", "1");
		requestInit.headers.set("x-no-origin", "1");
		requestInit.headers.set("x-tauri-fetch", "1");
	});
	__internalClerk.__unstable__onAfterResponse(async (_, response) => {
		if (!response) {
			logger.warn({}, "No response in Fapi call");
			return;
		}
		const header = response.headers.get("authorization");
		if (header) await saveClientJWT(header);
		if ("native_api_disabled" === response.payload?.errors?.[0]?.code) console.error("The Native API is disabled for this instance.\n", "Go to Clerk Dashboard > Configure > Native applications to enable it.\n", "Or, navigate here: https://dashboard.clerk.com/last-active?path=native-applications");
	});
	await __internalClerk.load({
		...initArgs,
		sdkMetadata,
		standardBrowser: false
	});
	return __internalClerk;
};

//#endregion
export { consoleLogger, init, noopLogger };