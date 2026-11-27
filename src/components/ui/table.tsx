"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/** Tabela mais larga que a tela rola sozinha; aí o contêiner entra no Tab para rolar pelo teclado. */
function useScrollable<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [scrollable, setScrollable] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return [ref, scrollable] as const
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const [ref, scrollable] = useScrollable<HTMLDivElement>()
  return (
    <div
      ref={ref}
      data-slot="table-container"
      tabIndex={scrollable ? 0 : undefined}
      className="relative w-full overflow-x-auto rounded-kyb-botao focus-visible:outline-2 focus-visible:outline-kyb-azul-2"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-kyb-linha bg-kyb-canvas-2 font-semibold [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-kyb-linha transition-colors duration-150 ease-kyb hover:bg-kyb-canvas has-aria-expanded:bg-kyb-canvas data-[state=selected]:bg-kyb-canvas",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-rotulo whitespace-nowrap text-kyb-mudo [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
