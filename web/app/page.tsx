import Intro from "@/components/fx/Intro";
import Magnetic from "@/components/fx/Magnetic";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import How from "@/components/landing/How";
import Fuses from "@/components/landing/Fuses";
import Designers from "@/components/landing/Designers";
import Builders from "@/components/landing/Builders";
import Closing from "@/components/landing/Closing";

export default function Home() {
  return (
    <>
      <Intro />
      <div className="grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <Header />
      <main>
        <Hero />
        <Problem />
        <How />
        <Fuses />
        <Designers />
        <Builders />
        <Closing />
      </main>
      <Magnetic />
    </>
  );
}
