// The admin page uses the student app's own renderer and figure engine, so previews match what students see.
import DOMPurify from "dompurify";
import { renderRich, plainText } from "./render.js";

window.renderRich = renderRich;
window.plainText = plainText;
window.DOMPurify = DOMPurify;
import { gapHtml } from "./gaps.js";
window.gapHtml = gapHtml;
import { exampleHtml, parseExample } from "./example.js";
window.exampleHtml = exampleHtml;
window.parseExample = parseExample;
