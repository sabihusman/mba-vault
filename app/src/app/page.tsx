// The app root. With Browse/Ask navigation now in the shared header, a separate
// landing is redundant — send visitors straight to Browse. (Login redirects here
// on success; the proxy gate has already ensured they're authenticated.)
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/browse");
}
