import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Home from "./Home.jsx";
import ExcelJS from "exceljs";
import { recentScans } from "../data.js";

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<div>Scan page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pageInput = () => screen.getByPlaceholderText("https://www.example.com/page");
const domainInput = () => screen.getByPlaceholderText("https://www.example.com");
const runButton = () => screen.getByRole("button", { name: "Run scan" });

describe("Home screen", () => {
  // Acceptance criteria 1
  it("Given Home, then two modes show: Page URLs and Whole domain", () => {
    renderHome();
    expect(screen.getByRole("button", { name: "Page URLs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whole domain" })).toBeInTheDocument();
  });

  // Acceptance criteria 2
  it("Given I choose Whole domain, then its input appears", async () => {
    renderHome();
    expect(pageInput()).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Whole domain" }));

    expect(domainInput()).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("https://www.example.com/page")).not.toBeInTheDocument();
  });

  // Acceptance criteria 3
  it("Given nothing entered, then Run scan is disabled", () => {
    renderHome();
    expect(runButton()).toBeDisabled();
  });

  // Edge case
  it("Given only spaces entered, then Run scan is disabled", async () => {
    renderHome();
    await userEvent.type(pageInput(), "   ");
    expect(runButton()).toBeDisabled();
  });

  it("Given a valid page URL is entered, then Run scan is enabled", async () => {
    renderHome();
    await userEvent.type(pageInput(), "https://www.royalsundaram.in/copyright");
    expect(runButton()).toBeEnabled();
  });

  it("Given a domain in Page URLs mode, then Run scan stays disabled and an error shows", async () => {
    renderHome();
    await userEvent.type(pageInput(), "https://www.royalsundaram.in");

    expect(runButton()).toBeDisabled();
    expect(screen.getByText(/This is a domain, not a page/)).toBeInTheDocument();
  });

  it("Given a page URL in Whole domain mode, then Run scan stays disabled", async () => {
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "Whole domain" }));
    await userEvent.type(domainInput(), "https://www.royalsundaram.in/copyright");

    expect(runButton()).toBeDisabled();
  });

  it("Given a valid URL, when I click Run scan, then the scan page opens", async () => {
    renderHome();
    await userEvent.type(pageInput(), "https://www.royalsundaram.in/copyright");
    await userEvent.click(runButton());

    expect(screen.getByText("Scan page")).toBeInTheDocument();
  });
});
describe("Home: Fill from previous findings and Upload from Excel", () => {
  const setup = () =>
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
  const box = () => screen.getByRole("textbox");
  const press = (name) => fireEvent.click(screen.getByRole("button", { name }));
  const WAIT = { timeout: 5000 };

  async function xlsx(cells) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    cells.forEach((c) => ws.addRow([c]));
    return wb.xlsx.writeBuffer();
  }

  function pick(container, content, name = "urls.xlsx") {
    const file = new File(["x"], name);
    file.arrayBuffer = async () => content;
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { files: [file] } });
  }

  // Fill from previous findings
  it("Given I click Fill from previous findings, then the latest scan URL is in the box", () => {
    setup();
    press("Fill from previous findings");
    expect(box().value).toContain(recentScans[0].domain);
  });

    it("Given I click Fill from previous findings twice, then the URL is not repeated", () => {
    setup();
    press("Fill from previous findings");
    press("Fill from previous findings");
    expect(box().value).toContain(recentScans[0].domain);
    expect(box().value.split(",")).toHaveLength(1);
  });

  // Upload from Excel
  it("Given the page, then the file picker accepts only .xlsx files", () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input.accept).toContain(".xlsx");
  });

  it("Given I click Upload from Excel, then the file picker opens", () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const spy = vi.spyOn(input, "click");
    press("Upload from Excel");
    expect(spy).toHaveBeenCalled();
  });

  it("Given an Excel file with 3 URLs, then all 3 are in the box", async () => {
    const { container } = setup();
    pick(container, await xlsx(["https://a.com/1", "https://a.com/2", "https://a.com/3"]));
    await waitFor(
      () => expect(box().value).toBe("https://a.com/1, https://a.com/2, https://a.com/3"),
      WAIT,
    );
    expect(screen.getByText("3 pages added")).toBeTruthy();
  });

  it("Given a header row in the file, then the header is skipped", async () => {
    const { container } = setup();
    pick(container, await xlsx(["URL", "https://a.com/1"]));
    await waitFor(() => expect(box().value).toBe("https://a.com/1"), WAIT);
  });

  it("Given an Excel file with 60 URLs, then all 60 are in the box", async () => {
    const { container } = setup();
    const urls = Array.from({ length: 60 }, (_, i) => `https://a.com/p${i}`);
    pick(container, await xlsx(urls));
    await waitFor(() => expect(box().value.split(",")).toHaveLength(60), WAIT);
  });

  it("Given the same URL twice in the file, then it is added once", async () => {
    const { container } = setup();
    pick(container, await xlsx(["https://a.com/1", "https://a.com/1"]));
    await waitFor(() => expect(box().value).toBe("https://a.com/1"), WAIT);
  });

  it("Given a hyperlink cell, then the link address is used", async () => {
    const { container } = setup();
    pick(container, await xlsx([{ text: "Claims", hyperlink: "https://a.com/claims" }]));
    await waitFor(() => expect(box().value).toBe("https://a.com/claims"), WAIT);
  });

  it("Given text already in the box, then the Excel URLs are added after it", async () => {
    const { container } = setup();
    fireEvent.change(box(), { target: { value: "https://a.com/1" } });
    pick(container, await xlsx(["https://a.com/2"]));
    await waitFor(() => expect(box().value).toBe("https://a.com/1, https://a.com/2"), WAIT);
  });

  // Edge cases
  it("Given a file that is not .xlsx, then a message shows and the box stays empty", async () => {
    const { container } = setup();
    pick(container, Buffer.from("hello"), "urls.txt");
    expect(await screen.findByText("Please choose an Excel file (.xlsx).")).toBeTruthy();
    expect(box().value).toBe("");
  });

  it("Given an Excel file with no URLs, then a message shows", async () => {
    const { container } = setup();
    pick(container, await xlsx([]));
    expect(await screen.findByText("No URLs found in this file.", {}, WAIT)).toBeTruthy();
  });

  it("Given a .xlsx file that is not a real Excel file, then a message shows", async () => {
    const { container } = setup();
    pick(container, Buffer.from("hello"));
    expect(await screen.findByText("This file could not be read.", {}, WAIT)).toBeTruthy();
  });
});