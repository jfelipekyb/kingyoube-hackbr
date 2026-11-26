import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo oficial (SVG em public/marca, sem alteração). Nunca redesenhar com texto. */
export function Logo({ variant = "negativo", className }: { variant?: "positivo" | "negativo"; className?: string }) {
  const { src, width, height } =
    variant === "negativo"
      ? { src: "/marca/kingyoube-negativo.svg", width: 267, height: 131 }
      : { src: "/marca/kingyoube.svg", width: 1000, height: 480 };
  return <Image src={src} alt="KingYouBe" width={width} height={height} priority unoptimized className={cn("h-12 w-auto", className)} />;
}
