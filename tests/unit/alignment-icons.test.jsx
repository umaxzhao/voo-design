import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlignIcon, DistributeIcon, TidyIcon } from "../../src/canvas/components/alignment_icon.jsx";
import { IconAlignLeft, IconAlignCenter, IconAlignRight } from "../../src/canvas/icons.jsx";

it("renders the complete Figma set with distinct local assets and a nine-block tidy icon", () => {
  const types = ["left", "center", "right", "top", "middle", "bottom"];
  const html = renderToStaticMarkup(<>
    {types.map(type => <AlignIcon key={type} type={type} />)}
    <DistributeIcon axis="horizontal" />
    <DistributeIcon axis="vertical" />
    <TidyIcon />
  </>);
  expect(html.match(/data-alignment-icon=/g)).toHaveLength(9);
  expect(new Set(html.match(/alignment\/[^"&]+\.svg/g)).size).toBe(8);
  expect(html).not.toContain("figma.com");
  expect(html).toContain('data-alignment-icon="tidy"');
  expect(html.match(/<span><\/span>/g)).toHaveLength(9);
});

it("uses the same Figma assets for existing text alignment controls at their requested size", () => {
  for (const [Icon, type] of [[IconAlignLeft, "left"], [IconAlignCenter, "center"], [IconAlignRight, "right"]]) {
    expect(renderToStaticMarkup(<Icon size={13} />)).toBe(renderToStaticMarkup(<AlignIcon type={type} size={13} />));
  }
});
