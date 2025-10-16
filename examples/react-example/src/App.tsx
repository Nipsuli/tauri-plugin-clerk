import { type JSX, use, Suspense } from "react";
import reactLogo from "./assets/react.svg";
import clerkLogo from "./assets/clerk-dark.svg";

import {
  ClerkProvider,
  SignInButton,
  SignOutButton,
  useUser,
} from "@clerk/clerk-react";

import "./App.css";

import type { Clerk } from "@clerk/clerk-js";
import { initClerk } from "tauri-plugin-clerk";

const SigninOrShowUser = () => {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return <div>loading...</div>;
  }

  if (user) {
    return (
      <div>
        <p>{`Hello ${user.fullName ?? user.id}`}</p>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div>
      <SignInButton mode="modal" oauthFlow="redirect" />
    </div>
  );
};

const AppLoaded = ({ clerkPromise }: { clerkPromise: Promise<Clerk> }) => {
  const clerk = use(clerkPromise);
  return (
    <ClerkProvider publishableKey={clerk.publishableKey} Clerk={clerk}>
      <>
        <div className="row">
          <a href="https://vitejs.dev" rel="noreferrer" target="_blank">
            <img src="/vite.svg" className="logo vite" alt="Vite logo" />
          </a>
          <a href="https://tauri.app" rel="noreferrer" target="_blank">
            <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
          </a>
          <a href="https://reactjs.org" rel="noreferrer" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
          <a href="https://clerk.com/" rel="noreferrer" target="_blank">
            <img src={clerkLogo} className="logo Clerk" alt="React logo" />
          </a>
        </div>
        <p>Click on the Tauri, Vite, React, and Clerk logos to learn more.</p>
        <div>
          <SigninOrShowUser />
        </div>
      </>
    </ClerkProvider>
  );
};

const LoadingClerk = () => <div>Loading clerk...</div>;

const App = (): JSX.Element => {
  const clerkPromise = initClerk();
  return (
    <main className="container">
      <h1>Welcome to Tauri + React + Clerk</h1>
      <Suspense fallback={<LoadingClerk />}>
        <AppLoaded clerkPromise={clerkPromise} />
      </Suspense>
    </main>
  );
};

export default App;
