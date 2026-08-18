"use client";

import { useState } from "react";
import { kbGroupLogo } from "../lib/i18n";
import type { Language } from "../lib/types";

export function LanguageSetup({ onChoose }: { onChoose: (language: Language) => void }) {
  return (
    <main className="languageSetupPage">
      <section className="languageSetupCard" aria-labelledby="language-setup-title">
        <img src={kbGroupLogo} alt="KB Group" />
        <div>
          <h1 id="language-setup-title">Choose your language · Dilinizi seçin · Zimanê xwe hilbijêrin</h1>
          <p>The selected language will be used throughout MF-V-01.</p>
          <p>Seçtiğiniz dil MF-V-01’in tamamında kullanılacaktır.</p>
          <p>Zimanê ku hûn hilbijêrin dê li seranserê MF-V-01 were bikaranîn.</p>
        </div>
        <div className="languageChoiceGrid">
          <button onClick={() => onChoose("en")}><b>English</b><small>Continue in English</small></button>
          <button onClick={() => onChoose("ku")}><b>Kurdî</b><small>Bi Kurdî bidomîne</small></button>
          <button onClick={() => onChoose("tr")}><b>Türkçe</b><small>Türkçe devam et</small></button>
        </div>
      </section>
    </main>
  );
}

export function Login({
  language,
  setLanguage,
  onSignIn,
}: {
  language: Language;
  setLanguage: (x: Language) => void;
  onSignIn: (username: string, password: string) => Promise<string | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text =
    language === "tr"
      ? {
          title: "Maliye-Finans",
          sub: "Hesabınızla oturum açın",
          user: "Kullanıcı adı",
          pass: "Şifre",
          button: "Oturum Aç",
          error: "Kullanıcı adı veya şifre hatalı.",
        }
      : language === "en"
        ? {
            title: "Maliye-Finans",
            sub: "Sign in with your account",
            user: "Username",
            pass: "Password",
            button: "Sign In",
            error: "Incorrect username or password.",
          }
        : {
            title: "Maliye-Finans",
            sub: "Bi hesabê xwe têkevin",
            user: "Navê bikarhêner",
            pass: "Şîfre",
            button: "Têkeve",
            error: "Navê bikarhêner an şîfre şaş e.",
          };
  return (
    <main className="loginPage">
      <div className="loginCard">
        <div className="loginBrand">
          <img src={kbGroupLogo} alt="KB Group" />
          <div>
            <h1>{text.title}</h1>
            <p>{text.sub}</p>
          </div>
        </div>
        <label className="loginLanguage">
          ◎{" "}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="ku">Kurdî</option>
          </select>
        </label>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting) return;
            setSubmitting(true);
            const errorMessage = await onSignIn(username, password);
            setSubmitting(false);
            setError(errorMessage);
          }}
        >
          <label>
            {text.user}
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            {text.pass}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="loginError">{error}</p>}
          <button className="primary" disabled={submitting}>{text.button}</button>
        </form>
      </div>
    </main>
  );
}
