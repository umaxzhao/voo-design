function toTitleCase(value) {
    return value.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (word) => {
        const [first = "", ...rest] = Array.from(word);
        return `${first.toLocaleUpperCase()}${rest.join("").toLocaleLowerCase()}`;
    });
}
export function applyTextCase(value, textCase) {
    if (textCase === "upper")
        return value.toLocaleUpperCase();
    if (textCase === "lower")
        return value.toLocaleLowerCase();
    if (textCase === "title")
        return toTitleCase(value);
    return value;
}
export function applyTextListStyle(value, listStyle) {
    if (!listStyle || listStyle === "none")
        return value;
    let itemNumber = 0;
    return value
        .split("\n")
        .map((line) => {
        if (!line.trim())
            return line;
        itemNumber += 1;
        return listStyle === "bulleted" ? `• ${line}` : `${itemNumber}. ${line}`;
    })
        .join("\n");
}
export function getDisplayText(node) {
    return applyTextListStyle(applyTextCase(node.text ?? "", node.textCase), node.textListStyle);
}
//# sourceMappingURL=text-display.js.map