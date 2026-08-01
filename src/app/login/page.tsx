import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "登录" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
