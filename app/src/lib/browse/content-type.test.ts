import { describe, it, expect } from "vitest";
import { contentTypeFor, dispositionFor, contentDisposition } from "./content-type";

describe("contentTypeFor", () => {
  it("maps known extensions and falls back to octet-stream", () => {
    expect(contentTypeFor("pdf")).toBe("application/pdf");
    expect(contentTypeFor("xlsx")).toContain("spreadsheetml");
    expect(contentTypeFor("txt")).toContain("text/plain");
    expect(contentTypeFor("zzz")).toBe("application/octet-stream");
    expect(contentTypeFor("")).toBe("application/octet-stream");
  });
});

describe("dispositionFor", () => {
  it("inlines viewable types, downloads office docs", () => {
    expect(dispositionFor("pdf")).toBe("inline");
    expect(dispositionFor("txt")).toBe("inline");
    expect(dispositionFor("png")).toBe("inline");
    expect(dispositionFor("xlsx")).toBe("attachment");
    expect(dispositionFor("docx")).toBe("attachment");
    expect(dispositionFor("zzz")).toBe("attachment");
  });

  it("forces attachment for otherwise-inline types when download is requested", () => {
    expect(dispositionFor("pdf", true)).toBe("attachment");
    expect(dispositionFor("png", true)).toBe("attachment");
    // Office types are attachment either way.
    expect(dispositionFor("docx", true)).toBe("attachment");
    // Explicitly false keeps the inline default.
    expect(dispositionFor("pdf", false)).toBe("inline");
  });
});

describe("contentDisposition", () => {
  it("builds an RFC 5987 header, sanitising the ASCII fallback", () => {
    const header = contentDisposition("attachment", 'Q1 "notes".pdf');
    expect(header.startsWith("attachment; filename=")).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('Q1 "notes".pdf'));
    // The raw quote must not survive in the ASCII filename="" part.
    expect(header).not.toContain('"Q1 "notes".pdf"');
  });

  it("preserves unicode via filename* and strips it from the fallback", () => {
    const header = contentDisposition("inline", "résumé.pdf");
    expect(header).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    expect(header).toContain('filename="r_sum_.pdf"');
  });
});
