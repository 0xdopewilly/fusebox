import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FuseView from "@/components/app/FuseView";
import { fuseHead } from "@/lib/fuseHead";

type Props = { params: Promise<{ id: string }> };
const valid = (id: string) => /^\d{1,6}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const f = valid(id) ? await fuseHead(Number(id)) : null;
  const title = `${f?.name ?? `Fuse ${id}`} · fuse ${id} · Fusebox`;
  const description = f?.summary ?? "A logic circuit taped out on TapeOut and listed in Fusebox's registry on X Layer. Install it on an agent wallet; its designer earns on every check.";
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function FusePage({ params }: Props) {
  const { id } = await params;
  if (!valid(id)) notFound();
  // the registry answered without this fuse: a real 404. A slow or failed read still renders the page.
  if ((await fuseHead(Number(id))) === null) notFound();
  return <FuseView id={Number(id)} />;
}
