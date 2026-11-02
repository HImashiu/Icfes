import { useState } from "react";

const src = (url) => (url.startsWith("data:") ? url : `${import.meta.env.BASE_URL}${url}`);
// Scan crops come from 300 dpi pages, so a crop prints at the size it had in the ICFES booklet (never wider than its column).
const MM_PER_PX = 25.4 / 300;

export default function CropImage({ url, option = false }) {
  const [width, setWidth] = useState(null);
  return (
    <figure className={option ? "bk-crop bk-crop-opt" : "bk-crop"}>
      <img src={src(url)} alt="" decoding="sync" style={width ? { width: `${width}mm` } : undefined}
        onLoad={(e) => setWidth(Math.max(20, e.currentTarget.naturalWidth * MM_PER_PX))} />
    </figure>
  );
}
