import { redirect } from "next/navigation";

export default function Home() {
  // Redirection vers les conversations
  redirect("/conversations");
}
