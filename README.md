# Bachelor’s Thesis

LaTeX source files for a bachelor’s thesis at the University of Tyumen.

## Tools

This project uses the following tools:

- [MacTeX](https://www.tug.org/mactex/) — a TeX distribution for macOS that includes LuaLaTeX and `latexmk`.
- [Bun](https://bun.com) — a TypeScript runtime for generating diagrams.

## Diagrams

Some figures in the document are generated using Bun.

To generate the diagrams, install the dependencies and run the `generate:diagrams` script:

```sh
bun install
bun run generate:diagrams
```

Both generators save BPMN and SVG files alongside their source scripts and PNG files in `./images/` for inclusion in the LaTeX document.

## Credits

Written by Egor Chumichev. Feel free to DM me on [Telegram](https://t.me/echoomy).
