"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { MemberstackLoginButton } from "@/components/auth/MemberstackLoginButton";
import { cn } from "@/lib/utils";

function LoginContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (searchParams.get("signup") === "true") {
      setTab("signup");
    }
  }, [searchParams]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image
            src="/logo.svg"
            alt="AiM Academy"
            width={180}
            height={51}
            className="h-12 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-dark.svg"
            alt="AiM Academy"
            width={180}
            height={51}
            className="h-12 w-auto hidden dark:block"
            priority
          />
        </div>
        <p className="text-sm text-muted-foreground">
          AI-powered prompt optimization
        </p>
      </CardHeader>
      <CardContent>
        {/* Tab toggle */}
        <div className="flex rounded-lg border p-1 mb-6">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
              tab === "login"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
              tab === "signup"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Create Account
          </button>
        </div>

        {tab === "login" ? <LoginForm /> : <SignupForm />}

        {/* AiM member login */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-sm text-muted-foreground text-center mb-3">
            Already an AiM Member?
          </p>
          <MemberstackLoginButton />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.svg"
              alt="AiM Academy"
              width={180}
              height={51}
              className="h-12 w-auto dark:hidden"
              priority
            />
            <Image
              src="/logo-dark.svg"
              alt="AiM Academy"
              width={180}
              height={51}
              className="h-12 w-auto hidden dark:block"
              priority
            />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardHeader>
      </Card>
    }>
      <LoginContent />
    </Suspense>
  );
}
