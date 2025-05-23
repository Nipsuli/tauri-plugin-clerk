import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import clerkLogo from "./assets/clerk-dark.svg";
// import { invoke } from "@tauri-apps/api/core";

import {
  ClerkProvider,
  SignInButton,
  SignOutButton,
  useClerk,
  useUser,
} from "@clerk/clerk-react";

import "./App.css";

import type { Clerk } from "@clerk/clerk-js";
import { init } from "tauri-plugin-clerk";

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

const AppLoaded = ({ clerk }: { clerk: Clerk }) => {
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

const LoadingClerk = () => {
  return <div>Loading clerk...</div>;
};

const App = () => {
  const [clerk, setClerk] = useState<Clerk | null>(null);

  useEffect(() => {
    // avoid double loading in dev
    const timeout = setTimeout(() => init({}).then(setClerk), 16);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <main className="container">
      <h1>Welcome to Tauri + React + Clerk</h1>
      {clerk ? <AppLoaded clerk={clerk} /> : <LoadingClerk />}
    </main>
  );
};

export default App;
