import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import clerkLogo from "./assets/clerk-dark.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import type { Clerk } from "@clerk/clerk-js";
import { init } from "tauri-plugin-clerk";

const AppLoaded = () => {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }
  return (
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

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </>
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
      {clerk ? <AppLoaded /> : <LoadingClerk />}
    </main>
  );
};

export default App;
