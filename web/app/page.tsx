import Intro from "@/components/fx/Intro";
import Magnetic from "@/components/fx/Magnetic";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import LiveProof from "@/components/landing/LiveProof";
import How from "@/components/landing/How";
import OnTapeOut from "@/components/landing/OnTapeOut";
import Fuses from "@/components/landing/Fuses";
import Users from "@/components/landing/Users";
import StudioPitch from "@/components/landing/StudioPitch";
import Designers from "@/components/landing/Designers";
import Builders from "@/components/landing/Builders";
import Closing from "@/components/landing/Closing";
import { LangKeyed } from "@/lib/i18n";

export default function Home() {
  return (
    <>
      <Intro />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <LangKeyed>
      <Header />
      <main id="main">
        <Hero />
        <LiveProof />
        <Problem />
        <How />
        <OnTapeOut />
        <Fuses />
        <Users />
        <StudioPitch />
        <Designers />
        <Builders />
        <Closing />
      </main>
      </LangKeyed>
      <Magnetic />
    </>
  );
}
