import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FuseView from "@/components/app/FuseView";
import { getMarket } from "@/lib/market";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // the registry is read with a short leash: a slow RPC shouldn't hold up the page's title
  const f = await Promise.race([getMarket().then((m) => m.fuses.find((x) => x.fuseId === Number(id))), new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000))]).catch(() => undefined);
  const name = f?.meta?.name ?? f?.name ?? `Fuse ${id}`;
  const title = `${name} · fuse ${id} · Fusebox`;
  const description = f?.meta?.summary ?? `A logic circuit taped out on TapeOut and listed in Fusebox's registry on X Layer. Install it on an agent wallet; its designer earns on every check.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function FusePage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,6}$/.test(id)) notFound();
  // a registry that answers without this fuse means it doesn't exist; a slow or failed read just renders the page
  const m = await Promise.race([getMarket(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null);
  if (m && !m.fuses.some((x) => x.fuseId === Number(id))) notFound();
  return <FuseView id={Number(id)} />;
}
