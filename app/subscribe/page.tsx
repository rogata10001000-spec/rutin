import { redirect } from "next/navigation";
import { buildSubscribeCastUrl } from "@/lib/subscribe-paths";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SubscribeRootPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") flat[key] = value;
    else if (Array.isArray(value) && value[0]) flat[key] = value[0];
  }
  redirect(buildSubscribeCastUrl(flat));
}
