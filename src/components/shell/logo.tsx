import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo oficial (SVG em public/marca, sem alteração). Nunca redesenhar com texto. */
export function Logo({ variant = "negativo", className }: { variant?: "positivo" | "negativo"; className?: string }) {
  const src = variant === "negativo" ? "/marca/kingyoube-negativo.svg" : "/marca/kingyoube.svg";
  return <Image src={src} alt="KingYouBe" width={160} height={48} priority unoptimized className={cn("h-9 w-auto", className)} />;
}
