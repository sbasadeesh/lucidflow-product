import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Home from "./Home.jsx";

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