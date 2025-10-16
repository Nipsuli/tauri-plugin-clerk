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
  SignInJSON,
  SignInResource,
  SignUpJSON,
  SignUpResource,
  UserJSON,
  UserResource,
  Web3WalletJSON,
  Web3WalletResource,
} from "@clerk/types";

const clerkSignUpToSignUpJSON = (signUp: SignUpResource): SignUpJSON => ({
  object: "sign_up",
  id: signUp.id!, // oxlint-disable-line typescript/no-non-null-assertion
  status: signUp.status!, // oxlint-disable-line typescript/no-non-null-assertion
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
  // nullify this as the VerificationJSON is messed up
  verifications: null,
  locale: signUp.locale,
});

// Copy From @clerk/types
type CamelToSnake<T> = T extends `${infer C0}${infer R}`
  ? `${C0 extends Uppercase<C0> ? "_" : ""}${Lowercase<C0>}${CamelToSnake<R>}`
  : T extends object
    ? {
        [K in keyof T as CamelToSnake<Extract<K, string>>]: T[K];
      }
    : T;

const strFromCamelToSnake = (str: string): string => {
  if (!str) {
    return "";
  }
  return str.replace(/[A-Z]/g, (match, offset: number) => {
    if (offset === 0) {
      return match.toLowerCase();
    } else {
      return `_${match.toLowerCase()}`;
    }
  });
};

const camelToSnake = <T extends object>(obj: T): CamelToSnake<T> => {
  const res: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    res[strFromCamelToSnake(key)] = value;
  }
  return res as CamelToSnake<T>;
};

const clerkSignInToSignInJSON = (signIn: SignInResource): SignInJSON => ({
  object: "sign_in",
  id: signIn.id!, // oxlint-disable-line typescript/no-non-null-assertion
  status: signIn.status!, // oxlint-disable-line typescript/no-non-null-assertion
  supported_identifiers: [],
  identifier: signIn.identifier!, // oxlint-disable-line typescript/no-non-null-assertion
  user_data: {
    first_name: signIn.userData?.firstName ?? "",
    last_name: signIn.userData?.lastName ?? "",
    image_url: signIn.userData?.imageUrl ?? "",
    has_image: signIn.userData?.hasImage ?? false,
  },
  supported_first_factors:
    signIn.supportedFirstFactors?.map(camelToSnake) ?? [],
  supported_second_factors:
    signIn.supportedSecondFactors?.map(camelToSnake) ?? [],
  // nullify this as the VerificationJSON is messed up
  first_factor_verification: null,
  // nullify this as the VerificationJSON is messed up
  second_factor_verification: null,
  created_session_id: signIn.createdSessionId,
});

export const clerkClientToClientJSON = (
  client: ClientResource,
): ClientJSON => ({
  object: "client",
  id: client.id!, // oxlint-disable-line typescript/no-non-null-assertion
  sessions: client.sessions.map(clerkSessionToSessionJSON),
  sign_up: client.signUp ? clerkSignUpToSignUpJSON(client.signUp) : null,
  sign_in: client.signIn ? clerkSignInToSignInJSON(client.signIn) : null,
  captcha_bypass: client.captchaBypass,
  last_active_session_id: client.lastActiveSessionId,
  last_authentication_strategy: client.lastAuthenticationStrategy,
  cookie_expires_at: client.cookieExpiresAt
    ? client.cookieExpiresAt.getTime() / 1000
    : null,
  created_at: client.createdAt ? client.createdAt.getTime() / 1000 : 0,
  updated_at: client.updatedAt ? client.updatedAt.getTime() / 1000 : 0,
});

export const clerkSessionToSessionJSON = (
  session: SessionResource,
): SessionJSON => ({
  object: "session",
  id: session.id,
  status: session.status,
  factor_verification_age: session.factorVerificationAge,
  expire_at: session.expireAt.getTime() / 1000,
  abandon_at: session.abandonAt.getTime() / 1000,
  last_active_at: session.lastActiveAt.getTime() / 1000,
  last_active_token: {
    object: "token",
    id: session.lastActiveToken!.id!, // oxlint-disable-line typescript/no-non-null-assertion
    jwt: session.lastActiveToken!.getRawString(), // oxlint-disable-line typescript/no-non-null-assertion
  },
  last_active_organization_id: session.lastActiveOrganizationId,
  actor: session.actor,
  tasks: session.tasks,
  user: clerkUserToUserJSON(session.user!), // oxlint-disable-line typescript/no-non-null-assertion
  public_user_data: clerkPublicUserDataToPublicUserDataJSON(
    session.publicUserData,
  ),
  created_at: session.createdAt.getTime() / 1000,
  updated_at: session.updatedAt.getTime() / 1000,
});

const clerkEmailAddressToEmailAdressJSON = (
  emailAddress: EmailAddressResource,
): EmailAddressJSON => ({
  object: "email_address",
  id: emailAddress.id,
  email_address: emailAddress.emailAddress,
  linked_to: emailAddress.linkedTo.map((l) => ({
    // the api typing doesn't have object name for this
    object: "",
    id: l.id,
    type: l.type,
  })),
  matches_sso_connection: emailAddress.matchesSsoConnection,
  // nullify this as the VerificationJSON is messed up
  verification: null,
});

const clerkPhoneNumberToPhoneNumberJSON = (
  phoneNumber: PhoneNumberResource,
): PhoneNumberJSON => ({
  object: "phone_number",
  id: phoneNumber.id,
  phone_number: phoneNumber.phoneNumber,
  reserved_for_second_factor: phoneNumber.reservedForSecondFactor,
  default_second_factor: phoneNumber.defaultSecondFactor,
  linked_to: phoneNumber.linkedTo.map((l) => ({
    // the api typing doesn't have object name for this
    object: "",
    id: l.id,
    type: l.type,
  })),
  // nullify this as the VerificationJSON is messed up
  verification: null,
  // Skipping optional backup_codes
});

const clerkWeb3WalletToWeb3WalletJSON = (
  web3Wallet: Web3WalletResource,
): Web3WalletJSON => ({
  object: "web3_wallet",
  id: web3Wallet.id,
  web3_wallet: web3Wallet.web3Wallet,
  // nullify this as the VerificationJSON is messed up
  verification: null,
});

const clerkExternalAccountToExternalAccountJSON = (
  externalAccount: ExternalAccountResource,
): ExternalAccountJSON => ({
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
  // skipping optional verification as VerificationJSON is messed up
});

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
    ? enterpriseAccount.lastAuthenticatedAt.getTime() / 1000
    : null,
});

const clerkPasskeyToPasskeyJSON = (passkey: PasskeyResource): PasskeyJSON => ({
  object: "passkey",
  id: passkey.id,
  name: passkey.name,
  verification: null,
  last_used_at: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() / 1000 : null,
  updated_at: passkey.createdAt.getTime() / 1000,
  created_at: passkey.createdAt.getTime() / 1000,
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
  created_at: organizationMembership.createdAt.getTime() / 1000,
  updated_at: organizationMembership.updatedAt.getTime() / 1000,
});

export const clerkUserToUserJSON = (user: UserResource): UserJSON => ({
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
  external_accounts: user.externalAccounts.map(
    clerkExternalAccountToExternalAccountJSON,
  ),
  enterprise_accounts: user.enterpriseAccounts.map(
    clerkEnterpriseAccountToEnterpriseAccountJSON,
  ),
  passkeys: user.passkeys.map(clerkPasskeyToPasskeyJSON),
  saml_accounts: [],
  organization_memberships: user.organizationMemberships.map(
    clerkOrganizationMembershipToOrganizationMembershipJSON,
  ),
  password_enabled: user.passwordEnabled,
  profile_image_id: user.imageUrl,
  first_name: user.firstName,
  last_name: user.lastName,
  totp_enabled: user.totpEnabled,
  backup_code_enabled: user.backupCodeEnabled,
  two_factor_enabled: user.twoFactorEnabled,
  public_metadata: user.publicMetadata,
  unsafe_metadata: user.unsafeMetadata,
  last_sign_in_at: user.lastSignInAt
    ? user.lastSignInAt.getTime() / 1000
    : null,
  create_organization_enabled: user.createOrganizationEnabled,
  create_organizations_limit: user.createOrganizationsLimit,
  delete_self_enabled: user.deleteSelfEnabled,
  legal_accepted_at: user.legalAcceptedAt
    ? user.legalAcceptedAt.getTime() / 1000
    : null,
  updated_at: user.updatedAt ? user.updatedAt.getTime() / 1000 : 0,
  created_at: user.createdAt ? user.createdAt.getTime() / 1000 : 0,
});

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
  created_at: organization.createdAt.getTime() / 1000,
  updated_at: organization.updatedAt.getTime() / 1000,
  members_count: organization.membersCount,
  pending_invitations_count: organization.membersCount,
  admin_delete_enabled: organization.adminDeleteEnabled,
  max_allowed_memberships: organization.maxAllowedMemberships,
});
