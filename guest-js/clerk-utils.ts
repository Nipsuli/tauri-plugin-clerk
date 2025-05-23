import type { ClientJSON, ClientResource, EmailAddressJSON, EmailAddressResource, EnterpriseAccountConnectionJSON, EnterpriseAccountConnectionResource, EnterpriseAccountJSON, EnterpriseAccountResource, ExternalAccountJSON, ExternalAccountResource, OrganizationJSON, OrganizationMembershipJSON, OrganizationMembershipResource, OrganizationResource, PasskeyJSON, PasskeyResource, PhoneNumberJSON, PhoneNumberResource, PublicUserData, PublicUserDataJSON, SessionJSON, SessionResource, UserJSON, UserResource, VerificationJSON, VerificationResource, Web3WalletJSON, Web3WalletResource } from "@clerk/types";

export const clerkClientToClientJSON = (client: ClientResource): ClientJSON => {
  return {
    //
  } satisfies ClientJSON;
};

export const clerkSessionToSessionJSON = (session: SessionResource): SessionJSON => {
  return {
    //
  } satisfies SessionJSON;
}


const clerkEmailAddressToEmailAdressJSON = (emailAddress: EmailAddressResource): EmailAddressJSON => ({
  object: 'email_address',
  id: emailAddress.id,
  email_address: emailAddress.emailAddress,
  linked_to: emailAddress.linkedTo.map(l => ({
    // the api typing doesn't have object name for this
    object: '',
    id: l.id,
    type: l.type
  })),
  matches_sso_connection: emailAddress.matchesSsoConnection,
  // nullify this as the VerificationJSON is messed up
  verification: null,
});

const clerkPhoneNumberToPhoneNumberJSON = (phoneNumber: PhoneNumberResource): PhoneNumberJSON => ({
  object: 'phone_number',
  id: phoneNumber.id,
  phone_number: phoneNumber.phoneNumber,
  reserved_for_second_factor: phoneNumber.reservedForSecondFactor,
  default_second_factor: phoneNumber.defaultSecondFactor,
  linked_to: phoneNumber.linkedTo.map(l => ({
    // the api typing doesn't have object name for this
    object: '',
    id: l.id,
    type: l.type
  })),
  // nullify this as the VerificationJSON is messed up
  verification: null,
  // Skipping optional backup_codes
});

const clerkWeb3WalletToWeb3WalletJSON = (web3Wallet: Web3WalletResource): Web3WalletJSON => ({
  object: 'web3_wallet',
  id: web3Wallet.id,
  web3_wallet: web3Wallet.web3Wallet,
  // nullify this as the VerificationJSON is messed up
  verification: null
});

const clerkExternalAccountToExternalAccountJSON = (externalAccount: ExternalAccountResource): ExternalAccountJSON => ({
  object: 'external_account',
  id: externalAccount.id,
  provider: externalAccount.provider,
  identification_id: externalAccount.identificationId,
  provider_user_id: externalAccount.providerUserId,
  approved_scopes: externalAccount.approvedScopes,
  email_address: externalAccount.emailAddress,
  first_name: externalAccount.firstName,
  last_name: externalAccount.lastName,
  image_url: externalAccount.imageUrl,
  username: externalAccount.username ?? '',
  phone_number: externalAccount.phoneNumber ?? '',
  public_metadata: externalAccount.publicMetadata,
  label: externalAccount.label ?? '',
  // skipping optional verification as VerificationJSON is messed up
});

const clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON = (enterpriseAccountConnection: EnterpriseAccountConnectionResource): EnterpriseAccountConnectionJSON => ({
  object: 'enterprise_account_connection',
  id: enterpriseAccountConnection.id ?? '',
  active: enterpriseAccountConnection.active,
  allow_idp_initiated: enterpriseAccountConnection.allowIdpInitiated,
  allow_subdomains: enterpriseAccountConnection.allowSubdomains,
  disable_additional_identifications: enterpriseAccountConnection.disableAdditionalIdentifications,
  domain: enterpriseAccountConnection.domain,
  logo_public_url: enterpriseAccountConnection.logoPublicUrl,
  name: enterpriseAccountConnection.name,
  protocol: enterpriseAccountConnection.protocol,
  provider: enterpriseAccountConnection.provider,
  sync_user_attributes: enterpriseAccountConnection.syncUserAttributes ,
  // Required in the type, but not really available in the data
  created_at: 0,
  updated_at: 0,
});

const clerkEnterpriseAccountToEnterpriseAccountJSON = (enterpriseAccount: EnterpriseAccountResource): EnterpriseAccountJSON => ({
  object: 'enterprise_account',
  id: enterpriseAccount.id ?? '',
  active: enterpriseAccount.active ?? false,
  email_address: enterpriseAccount.emailAddress ?? '',
  enterprise_connection: enterpriseAccount.enterpriseConnection ? clerkEnterpriseAccountConnectionToEnterpriseAccountConnectionJSON(enterpriseAccount.enterpriseConnection) : null,
  first_name: enterpriseAccount.firstName ?? '',
  last_name: enterpriseAccount.lastName ?? '',
  protocol: enterpriseAccount.protocol,
  provider: enterpriseAccount.provider,
  provider_user_id: enterpriseAccount.providerUserId ?? '',
  public_metadata: enterpriseAccount.publicMetadata ?? {},
  // nullify this as the VerificationJSON is messed up
  verification:  null,
});

const clerkPasskeyToPasskeyJSON = (passkey: PasskeyResource): PasskeyJSON => ({
  object: 'passkey',
  id: passkey.id,
  name: passkey.name,
  verification: null,
  last_used_at: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() / 1000 : null,
  updated_at: passkey.createdAt.getTime() / 1000,
  created_at: passkey.createdAt.getTime() / 1000,
});

const clerkPublicUserDataToPublicUserDataJSON = (publicUserData: PublicUserData): PublicUserDataJSON => {
  const res: PublicUserDataJSON = {
    first_name: publicUserData.firstName,
    last_name: publicUserData.lastName,
    image_url: publicUserData.imageUrl,
    has_image: publicUserData.hasImage,
    identifier: publicUserData.identifier,
  };
  if (publicUserData.userId) {
    res['user_id'] = publicUserData.userId;
  }

  return res
};

const clerkOrganizationMembershipToOrganizationMembershipJSON = (organizationMembership: OrganizationMembershipResource): OrganizationMembershipJSON => ({
  object: 'organization_membership',
  id: organizationMembership.id,
  organization: clerkOrganizationToOrganizationJSON(organizationMembership.organization),
  permissions: organizationMembership.permissions,
  public_metadata: organizationMembership.publicMetadata,
  public_user_data: clerkPublicUserDataToPublicUserDataJSON(organizationMembership.publicUserData),
  role: organizationMembership.role,
  created_at: organizationMembership.createdAt.getTime() / 1000,
  updated_at: organizationMembership.updatedAt.getTime() / 1000,
});

export const clerkUserToUserJSON = (user: UserResource): UserJSON => {
  return {
    object: 'user',
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
    last_sign_in_at: user.lastSignInAt ? user.lastSignInAt.getTime() / 1000 : null,
    create_organization_enabled: user.createOrganizationEnabled,
    create_organizations_limit: user.createOrganizationsLimit,
    delete_self_enabled: user.deleteSelfEnabled,
    // TODO: figure out where to parse
    legal_accepted_at: null,
    updated_at: user.updatedAt ? user.updatedAt.getTime() / 1000 : 0,
    created_at: user.createdAt ? user.createdAt.getTime() / 1000 : 0,
  } satisfies UserJSON;
}

export const clerkOrganizationToOrganizationJSON = (organization: OrganizationResource): OrganizationJSON => {
  return {
    object: 'organization',
    id: organization.id,
    image_url: organization.imageUrl,
    has_image: organization.hasImage,
    name: organization.name,
    slug: organization.slug ?? '',
    public_metadata: organization.publicMetadata,
    created_at: organization.createdAt.getTime() / 1000,
    updated_at: organization.updatedAt.getTime() / 1000,
    members_count: organization.membersCount,
    pending_invitations_count: organization.membersCount,
    admin_delete_enabled: organization.adminDeleteEnabled,
    max_allowed_memberships: organization.maxAllowedMemberships;

  } satisfies OrganizationJSON;
}
