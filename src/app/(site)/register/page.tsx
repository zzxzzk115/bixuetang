import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "创建角色" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
