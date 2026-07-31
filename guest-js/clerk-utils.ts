/**
 * Tried to use the __internal_toSnapshot() methods but in some cases
 * those crashed, so rolled these helpers. There seems to be lot of
 * missmatches with the clerk types and had to use non-null-assertions
 * Don't like that, ideally in future we can improve these
 */
import type {
  ClientJSON,
  ClientResource,
  EmailAddressJSON,
  EmailAddressResource,
  EnterpriseAccountConnectionJSON,
  EnterpriseAccountConnectionResource,
  EnterpriseAccountJSON,
  EnterpriseAccountResource,
  ExternalAccountJSON,
  ExternalAccountResource,
  OrganizationJSON,
  OrganizationMembershipJSON,
  OrganizationMembershipResource,
  OrganizationResource,
  PasskeyJSON,
  PasskeyResource,
  PhoneNumberJSON,
  PhoneNumberResource,
  PublicUserData,
  PublicUserDataJSON,
  SessionJSON,
  SessionResource,
  UserJSON,
  UserResource,
  Web3WalletJSON,
  Web3WalletResource,
} from "@clerk/shared/types";

type TimestampedResource = {
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type RustUserCompatibilityFields = {
  banned?: boolean;
  locked?: boolean;
  lockoutExpiresInSeconds?: number | null;
  verificationAttemptsRemaining?: number | null;
  lastActiveAt?: Date | null;
  mfaEnabledAt?: Date | null;
  mfaDisabledAt?: Date | null;
};

const RUST_SUPPORTED_IDENTIFICATION_LINK_TYPES = new Set([
  "oauth_apple",
  "oauth_google",
  "oauth_mock",
  "oauth_custom_mock",
  "saml",
]);

const RUST_SUPPORTED_SESSION_STATUSES = new Set([
  "active",
  "revoked",
  "ended",
  "expired",
  "removed",
  "abandoned",
  "pending",
]);

const toUnixTimestamp = (date: Date | null | undefined): number =>
  date ? Math.floor(date.getTime() / 1000) : 0;

const toNullableUnixTimestamp = (
  date: Date | null | undefined,
): number | null => (date ? toUnixTimestamp(date) : null);

const resourceTimestamps = (
  resource: object,
): { created_at: number; updated_at: number } => {
  const timestamped = resource as TimestampedResource;
  return {
    created_at: toUnixTimestamp(timestamped.createdAt),
    updated_at: toUnixTimestamp(timestamped.updatedAt),
  };
};

const clerkIdentificationLinksToJSON = (
  links: EmailAddressResource["linkedTo"],
) =>
  links
    .filter((link) => RUST_SUPPORTED_IDENTIFICATION_LINK_TYPES.has(link.type))
    .map((link) => ({
      object: "",
      id: link.id,
      type: link.type,
    }));

export const clerkClientToClientJSON = (
  client: ClientResource,
): ClientJSON => ({
  object: "client",
  id: client.id!, // oxlint-disable-line typescript/no-non-null-assertion
  sessions: client.sessions
    .filter((session) => RUST_SUPPORTED_SESSION_STATUSES.has(session.status))
    .map((session) => clerkSessionToSessionJSON(session)),
  // In-progress attempts are transient JS-owned state. Clerk's SignInJSON and
  // SignUpJSON wire schemas differ from clerk-fapi-rs, so persisting them would
  // make the entire client snapshot impossible to restore on the Rust side.
  sign_up: null,
  sign_in: null,
  captcha_bypass: client.captchaBypass,
  last_active_session_id: client.lastActiveSessionId,
  last_authentication_strategy: client.lastAuthenticationStrategy,
  cookie_expires_at: client.cookieExpiresAt
    ? toUnixTimestamp(client.cookieExpiresAt)
    : null,
  created_at: toUnixTimestamp(client.createdAt),
  updated_at: toUnixTimestamp(client.updatedAt),
});

export const clerkSessionToSessionJSON = (
  session: SessionResource,
): SessionJSON =>
  ({
    object: "session",
    id: session.id,
    status: session.status,
    factor_verification_age: session.factorVerificationAge ?? [],
    expire_at: toUnixTimestamp(session.expireAt),
    abandon_at: toUnixTimestamp(session.abandonAt),
    last_active_at: toUnixTimestamp(session.lastActiveAt),
    last_active_token: session.lastActiveToken
      ? {
          object: "token",
          id: session.lastActiveToken.id!, // oxlint-disable-line typescript/no-non-null-assertion
          jwt: session.lastActiveToken.getRawString(),
        }
      : null,
    last_active_organization_id: session.lastActiveOrganizationId,
    actor: session.actor,
    tasks: session.tasks,
    user: session.user ? clerkUserToUserJSON(session.user) : null,
    public_user_data: clerkPublicUserDataToPublicUserDataJSON(
      session.publicUserData,
    ),
    created_at: toUnixTimestamp(session.createdAt),
    updated_at: toUnixTimestamp(session.updatedAt),
  }) as SessionJSON;

const clerkEmailAddressToEmailAdressJSON = (
  emailAddress: EmailAddressResource,
): EmailAddressJSON =>
  ({
    object: "email_address",
    id: emailAddress.id,
    email_address: emailAddress.emailAddress,
    linked_to: clerkIdentificationLinksToJSON(emailAddress.linkedTo),
    matches_sso_connection: emailAddress.matchesSsoConnection,
    reserved: false,
    ...resourceTimestamps(emailAddress),
    // nullify this as the VerificationJSON is mismatched between the SDKs
    verification: null,
  }) as EmailAddressJSON;

const clerkPhoneNumberToPhoneNumberJSON = (
  phoneNumber: PhoneNumberResource,
): PhoneNumberJSON =>
  ({
    object: "phone_number",
    id: phoneNumber.id,
    phone_number: phoneNumber.phoneNumber,
    reserved_for_second_factor: phoneNumber.reservedForSecondFactor,
    default_second_factor: phoneNumber.defaultSecondFactor,
    linked_to: clerkIdentificationLinksToJSON(phoneNumber.linkedTo),
    reserved: false,
    ...resourceTimestamps(phoneNumber),
    // nullify this as the VerificationJSON is mismatched between the SDKs
    verification: null,
    backup_codes: phoneNumber.backupCodes,
  }) as PhoneNumberJSON;

const clerkWeb3WalletToWeb3WalletJSON = (
  web3Wallet: Web3WalletResource,
): Web3WalletJSON =>
  ({
    object: "web3_wallet",
    id: web3Wallet.id,
    web3_wallet: web3Wallet.web3Wallet,
    ...resourceTimestamps(web3Wallet),
    // nullify this as the VerificationJSON is mismatched between the SDKs
    verification: null,
  }) as Web3WalletJSON;

const clerkExternalAccountToExternalAccountJSON = (
  externalAccount: ExternalAccountResource,
): ExternalAccountJSON =>
  ({
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
    // nullify this as the VerificationJSON is mismatched between the SDKs
    verification: null,
  }) as unknown as ExternalAccountJSON;

const clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON = (
  enterpriseAccountConnection: EnterpriseAccountConnectionResource,
): EnterpriseAccountConnectionJSON => ({
  object: "enterprise_account_connection",
  id: enterpriseAccountConnection.id ?? "",
  active: enterpriseAccountConnection.active,
  allow_idp_initiated: enterpriseAccountConnection.allowIdpInitiated,
  allow_subdomains: enterpriseAccountConnection.allowSubdomains,
  disable_additional_identifications:
    enterpriseAccountConnection.disableAdditionalIdentifications,
  allow_organization_account_linking:
    enterpriseAccountConnection.allowOrganizationAccountLinking,
  domain: enterpriseAccountConnection.domain,
  logo_public_url: enterpriseAccountConnection.logoPublicUrl,
  name: enterpriseAccountConnection.name,
  protocol: enterpriseAccountConnection.protocol,
  provider: enterpriseAccountConnection.provider,
  sync_user_attributes: enterpriseAccountConnection.syncUserAttributes,
  // Required in the type, but not really available in the data
  created_at: 0,
  updated_at: 0,
  enterprise_connection_id: enterpriseAccountConnection.enterpriseConnectionId,
});

const clerkEnterpriseAccountToEnterpriseAccountJSON = (
  enterpriseAccount: EnterpriseAccountResource,
): EnterpriseAccountJSON => ({
  object: "enterprise_account",
  id: enterpriseAccount.id ?? "",
  active: enterpriseAccount.active ?? false,
  email_address: enterpriseAccount.emailAddress ?? "",
  enterprise_connection: enterpriseAccount.enterpriseConnection
    ? clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON(
        enterpriseAccount.enterpriseConnection,
      )
    : null,
  first_name: enterpriseAccount.firstName ?? "",
  last_name: enterpriseAccount.lastName ?? "",
  protocol: enterpriseAccount.protocol,
  provider: enterpriseAccount.provider,
  provider_user_id: enterpriseAccount.providerUserId ?? "",
  public_metadata: enterpriseAccount.publicMetadata ?? {},
  // nullify this as the VerificationJSON is messed up
  verification: null,
  enterprise_connection_id: enterpriseAccount.enterpriseConnectionId,
  last_authenticated_at: enterpriseAccount.lastAuthenticatedAt
    ? toUnixTimestamp(enterpriseAccount.lastAuthenticatedAt)
    : null,
});

const clerkPasskeyToPasskeyJSON = (passkey: PasskeyResource): PasskeyJSON => ({
  object: "passkey",
  id: passkey.id,
  name: passkey.name,
  verification: null,
  last_used_at: toNullableUnixTimestamp(passkey.lastUsedAt),
  updated_at: toUnixTimestamp(passkey.createdAt),
  created_at: toUnixTimestamp(passkey.createdAt),
});

const clerkPublicUserDataToPublicUserDataJSON = (
  publicUserData: PublicUserData | undefined,
): PublicUserDataJSON => {
  const res: PublicUserDataJSON = {
    first_name: publicUserData?.firstName ?? "",
    last_name: publicUserData?.lastName ?? "",
    image_url: publicUserData?.imageUrl ?? "",
    has_image: publicUserData?.hasImage ?? false,
    identifier: publicUserData?.identifier ?? "",
  };
  if (publicUserData?.userId) {
    res["user_id"] = publicUserData.userId;
  }

  return res;
};

const clerkOrganizationMembershipToOrganizationMembershipJSON = (
  organizationMembership: OrganizationMembershipResource,
): OrganizationMembershipJSON => ({
  object: "organization_membership",
  id: organizationMembership.id,
  organization: clerkOrganizationToOrganizationJSON(
    organizationMembership.organization,
  ),
  permissions: organizationMembership.permissions,
  public_metadata: organizationMembership.publicMetadata,
  public_user_data: clerkPublicUserDataToPublicUserDataJSON(
    organizationMembership.publicUserData,
  ),
  role: organizationMembership.role,
  role_name: organizationMembership.roleName,
  created_at: toUnixTimestamp(organizationMembership.createdAt),
  updated_at: toUnixTimestamp(organizationMembership.updatedAt),
});

export const clerkUserToUserJSON = (user: UserResource): UserJSON => {
  const compatibility = user as UserResource & RustUserCompatibilityFields;

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
    email_addresses: user.emailAddresses.map(
      clerkEmailAddressToEmailAdressJSON,
    ),
    phone_numbers: user.phoneNumbers.map(clerkPhoneNumberToPhoneNumberJSON),
    web3_wallets: user.web3Wallets.map(clerkWeb3WalletToWeb3WalletJSON),
    external_accounts: user.externalAccounts.map(
      clerkExternalAccountToExternalAccountJSON,
    ),
    enterprise_accounts: user.enterpriseAccounts.map(
      clerkEnterpriseAccountToEnterpriseAccountJSON,
    ),
    passkeys: user.passkeys.map(clerkPasskeyToPasskeyJSON),
    organization_memberships: user.organizationMemberships.map(
      clerkOrganizationMembershipToOrganizationMembershipJSON,
    ),
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
    verification_attempts_remaining:
      compatibility.verificationAttemptsRemaining ?? null,
    last_active_at: toNullableUnixTimestamp(compatibility.lastActiveAt),
    mfa_enabled_at: toNullableUnixTimestamp(compatibility.mfaEnabledAt),
    mfa_disabled_at: toNullableUnixTimestamp(compatibility.mfaDisabledAt),
    create_organization_enabled: user.createOrganizationEnabled,
    create_organizations_limit: user.createOrganizationsLimit,
    delete_self_enabled: user.deleteSelfEnabled,
    legal_accepted_at: toNullableUnixTimestamp(user.legalAcceptedAt),
    updated_at: toUnixTimestamp(user.updatedAt),
    created_at: toUnixTimestamp(user.createdAt),
  } as UserJSON;
};

export const clerkOrganizationToOrganizationJSON = (
  organization: OrganizationResource,
): OrganizationJSON => ({
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
  max_allowed_memberships: organization.maxAllowedMemberships,
});
