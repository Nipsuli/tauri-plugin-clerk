import assert from "node:assert/strict";
import test from "node:test";

import {
  clerkClientToClientJSON,
  clerkOrganizationToOrganizationJSON,
  clerkSessionToSessionJSON,
  clerkUserToUserJSON,
} from "../guest-js/clerk-utils.ts";

const at = (milliseconds: number): Date => new Date(milliseconds);

const organization = {
  id: "org_moonfire",
  imageUrl: "https://example.test/moonfire.png",
  hasImage: true,
  name: "Moonfire",
  slug: "moonfire",
  publicMetadata: {},
  createdAt: at(1_700_000_000_123),
  updatedAt: at(1_700_000_100_987),
  membersCount: 2,
  pendingInvitationsCount: 1,
  adminDeleteEnabled: true,
  maxAllowedMemberships: 10,
};

const publicUserData = {
  firstName: "Ada",
  lastName: "Lovelace",
  imageUrl: "https://example.test/ada.png",
  hasImage: true,
  identifier: "ada@example.test",
  userId: "user_ada",
};

const user = {
  id: "user_ada",
  externalId: null,
  primaryEmailAddressId: "email_ada",
  primaryPhoneNumberId: null,
  primaryWeb3WalletId: null,
  imageUrl: "https://example.test/ada.png",
  hasImage: true,
  username: null,
  emailAddresses: [
    {
      id: "email_ada",
      emailAddress: "ada@example.test",
      linkedTo: [
        { id: "idn_google", type: "oauth_google" },
        { id: "idn_microsoft", type: "oauth_microsoft" },
      ],
      matchesSsoConnection: false,
    },
  ],
  phoneNumbers: [],
  web3Wallets: [],
  externalAccounts: [],
  enterpriseAccounts: [],
  passkeys: [],
  organizationMemberships: [
    {
      id: "orgmem_ada",
      organization,
      permissions: ["org:sys_profile:read"],
      publicMetadata: {},
      publicUserData,
      role: "org:member",
      roleName: "Member",
      createdAt: at(1_700_000_200_111),
      updatedAt: at(1_700_000_300_999),
    },
  ],
  passwordEnabled: true,
  firstName: "Ada",
  lastName: "Lovelace",
  totpEnabled: false,
  backupCodeEnabled: false,
  twoFactorEnabled: false,
  publicMetadata: {},
  unsafeMetadata: {},
  lastSignInAt: at(1_700_000_400_444),
  createOrganizationEnabled: false,
  createOrganizationsLimit: 0,
  deleteSelfEnabled: false,
  legalAcceptedAt: null,
  updatedAt: at(1_700_000_500_999),
  createdAt: at(1_700_000_000_123),
};

const session = {
  id: "sess_ada",
  status: "active",
  factorVerificationAge: [3, -1],
  expireAt: at(1_700_003_600_999),
  abandonAt: at(1_700_007_200_999),
  lastActiveAt: at(1_700_000_600_987),
  lastActiveToken: {
    id: "token_ada",
    getRawString: () => "test-session-jwt",
  },
  lastActiveOrganizationId: organization.id,
  actor: null,
  tasks: null,
  user,
  publicUserData,
  createdAt: at(1_700_000_000_123),
  updatedAt: at(1_700_000_600_987),
};

const client = {
  id: "client_ada",
  sessions: [session, { status: "replaced" }],
  signUp: { id: "signup_transient" },
  signIn: { id: "signin_transient" },
  captchaBypass: false,
  lastActiveSessionId: session.id,
  lastAuthenticationStrategy: "password",
  cookieExpiresAt: at(1_700_086_400_999),
  createdAt: at(1_700_000_000_123),
  updatedAt: at(1_700_000_600_987),
};

test("serializes a signed-in Clerk client for clerk-fapi-rs", () => {
  const serializedClient = clerkClientToClientJSON(client as never);
  const serializedSession = clerkSessionToSessionJSON(session as never);
  const serializedUser = clerkUserToUserJSON(
    user as never,
  ) as unknown as Record<string, unknown>;
  const serializedOrganization = clerkOrganizationToOrganizationJSON(
    organization as never,
  );

  assert.equal(serializedClient.created_at, 1_700_000_000);
  assert.equal(serializedClient.updated_at, 1_700_000_600);
  assert.equal(serializedClient.cookie_expires_at, 1_700_086_400);
  assert.equal(serializedClient.sessions.length, 1);
  assert.equal(serializedClient.sign_in, null);
  assert.equal(serializedClient.sign_up, null);

  assert.deepEqual(serializedSession.factor_verification_age, [3, -1]);
  assert.equal(serializedSession.expire_at, 1_700_003_600);
  assert.equal(serializedSession.last_active_at, 1_700_000_600);

  assert.equal(serializedUser.banned, false);
  assert.equal(serializedUser.locked, false);
  assert.equal(serializedUser.lockout_expires_in_seconds, null);
  assert.equal(serializedUser.verification_attempts_remaining, null);
  assert.equal(serializedUser.last_active_at, null);
  assert.equal(serializedUser.mfa_enabled_at, null);
  assert.equal(serializedUser.mfa_disabled_at, null);
  assert.deepEqual(serializedUser.saml_accounts, []);

  const [serializedEmail] = serializedUser.email_addresses as Array<
    Record<string, unknown>
  >;
  assert.ok(serializedEmail);
  assert.equal(serializedEmail.reserved, false);
  assert.equal(serializedEmail.created_at, 0);
  assert.equal(serializedEmail.updated_at, 0);
  assert.deepEqual(serializedEmail.linked_to, [
    { object: "", id: "idn_google", type: "oauth_google" },
  ]);

  assert.equal(serializedOrganization.created_at, 1_700_000_000);
  assert.equal(serializedOrganization.updated_at, 1_700_000_100);
  assert.equal(serializedOrganization.pending_invitations_count, 1);
});
