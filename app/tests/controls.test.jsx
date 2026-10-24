import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { confirmDialog, DateField, FilePicker, Select } from "../src/components/Controls.jsx";

afterEach(cleanup);

describe("Select", () => {
  it("reads <option> children and reports the value as a string", () => {
    const onChange = vi.fn();
    render(<Select aria-label="Intentos" value="" onChange={onChange}><option value="">Sin límite</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select>);
    const box = screen.getByRole("combobox", { name: "Intentos" });
    expect(box.textContent).toContain("Sin límite");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "2" }));
    expect(onChange).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("reads options wrapped in a fragment (the chart builder's field lists)", () => {
    const onChange = vi.fn();
    const opts = (extra) => <>{extra}<option value="area">Área</option><option value="tema">Tema</option></>;
    render(<Select aria-label="Filas" value="area" onChange={onChange}>{opts(<option value="">Ninguna</option>)}</Select>);
    const box = screen.getByRole("combobox", { name: "Filas" });
    expect(box.textContent).toContain("Área");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "Tema" }));
    expect(onChange).toHaveBeenCalledWith("tema");
  });

  it("works from the keyboard and skips disabled options", () => {
    const onChange = vi.fn();
    render(<Select aria-label="Cuadernillo" value="a" onChange={onChange}><option value="a">A</option><option value="b" disabled>B</option><option value="c">C</option></Select>);
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("DateField", () => {
  it("picks a day as YYYY-MM-DD and respects min", () => {
    const onChange = vi.fn();
    render(<DateField aria-label="Entrega" value="2026-10-20" min="2026-10-18" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrega" }));
    expect(screen.getByRole("button", { name: / 17 (de )?oct/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: / 24 (de )?oct/ }));
    expect(onChange).toHaveBeenCalledWith("2026-10-24");
  });
});

describe("FilePicker", () => {
  it("passes dropped files in the same shape as a file input change", () => {
    const onChange = vi.fn();
    render(<FilePicker aria-label="Fotos" multiple onChange={onChange} />);
    const file = new File(["x"], "hoja.jpg", { type: "image/jpeg" });
    fireEvent.drop(screen.getByRole("button", { name: "Fotos" }).parentElement, { dataTransfer: { files: [file] } });
    expect(onChange.mock.calls[0][0].target.files).toEqual([file]);
  });
});

describe("confirmDialog", () => {
  it("resolves true on confirm and false on Escape", async () => {
    const yes = confirmDialog("¿Borrar?", { confirmLabel: "Borrar" });
    fireEvent.click(await screen.findByRole("button", { name: "Borrar" }));
    expect(await yes).toBe(true);
    const no = confirmDialog("¿Borrar otra vez?");
    fireEvent.keyDown(await screen.findByRole("alertdialog"), { key: "Escape" });
    expect(await no).toBe(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
