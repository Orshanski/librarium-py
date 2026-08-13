import type { ReactNode } from "react";
import { colors, fonts } from "../theme";
import type { RecapEpisode, RecapPart, RecapPerson, RecapSection } from "../api/endpoints/recap";

export function recapSectionAnchorId(index: number): string {
  return `recap-sec-${index}`;
}

export function recapPartAnchorId(index: number): string {
  return `recap-part-${index}`;
}

/** Выделение внутри строки: деление по `**` — нечётные куски становятся жирными. */
export function renderText(text: string): ReactNode {
  return text.split("**").map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: colors.text, fontWeight: 600 }}>{part}</strong>
      : <span key={i}>{part}</span>);
}

/**
 * Незнакомый вид раздела не теряется: обходим значения раздела вглубь и
 * выводим все встреченные строки абзацами. `kind`/`title` исключены — это
 * служебные поля самого раздела, не содержательный текст.
 */
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === "object") {
    Object.entries(node as Record<string, unknown>)
      .filter(([key]) => key !== "kind" && key !== "title")
      .forEach(([, v]) => collectStrings(v, out));
  }
  return out;
}

const sectionTitleStyle = (isMobile: boolean) => ({
  fontFamily: fonts.display,
  fontSize: isMobile ? 22 : 26,
  fontWeight: 600,
  color: colors.text,
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: `1px solid ${colors.border}`,
});

const paragraphStyle = (isMobile: boolean) => ({
  fontSize: isMobile ? 14 : 15,
  lineHeight: 1.75,
  color: colors.textSecondary,
  marginBottom: 14,
});

function Paragraphs({ paragraphs, isMobile }: Readonly<{ paragraphs: string[]; isMobile: boolean }>) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={paragraphStyle(isMobile)}>{renderText(p)}</p>
      ))}
    </>
  );
}

function ItemList({ items, isMobile }: Readonly<{ items: string[]; isMobile: boolean }>) {
  return (
    <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 8,
            fontSize: isMobile ? 14 : 15,
            lineHeight: 1.7,
            color: colors.textSecondary,
            marginBottom: 10,
          }}
        >
          <span style={{ color: colors.accent, opacity: 0.6, flexShrink: 0 }}>—</span>
          <span>{renderText(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function PeopleGrid({ people, isMobile }: Readonly<{ people: RecapPerson[]; isMobile: boolean }>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 12,
        marginBottom: 14,
      }}
    >
      {people.map((person, i) => (
        <div
          key={i}
          data-testid="recap-person"
          style={{
            background: "rgba(255, 255, 255, 0.035)",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.accent, marginBottom: 5 }}>
            {person.name}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: colors.textSecondary }}>
            {renderText(person.about)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Episode({ episode, isMobile }: Readonly<{ episode: RecapEpisode; isMobile: boolean }>) {
  return (
    <>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.accent, margin: "26px 0 10px" }}>
        {episode.title}
      </h3>
      <Paragraphs paragraphs={episode.paragraphs} isMobile={isMobile} />
    </>
  );
}

function SectionBody({ section, isMobile }: Readonly<{ section: RecapSection; isMobile: boolean }>) {
  if (section.kind === "people" && section.people) {
    return <PeopleGrid people={section.people} isMobile={isMobile} />;
  }
  if (section.kind === "episodes" && section.episodes) {
    return (
      <>
        {section.episodes.map((ep, i) => <Episode key={i} episode={ep} isMobile={isMobile} />)}
      </>
    );
  }
  if (section.kind === "list" && section.items) {
    return <ItemList items={section.items} isMobile={isMobile} />;
  }
  if (section.kind === "prose" && section.paragraphs) {
    return <Paragraphs paragraphs={section.paragraphs} isMobile={isMobile} />;
  }
  return <Paragraphs paragraphs={collectStrings(section)} isMobile={isMobile} />;
}

export interface RecapDocumentViewProps {
  sections: RecapSection[];
  isMobile: boolean;
  registerSectionRef?: (index: number, el: HTMLElement | null) => void;
}

/** Вкладка «Кратко»: разделы рекапа, разбор по виду раздела. */
export default function RecapDocumentView({
  sections,
  isMobile,
  registerSectionRef,
}: Readonly<RecapDocumentViewProps>) {
  return (
    <>
      {sections.map((section, i) => (
        <section
          key={i}
          id={recapSectionAnchorId(i)}
          ref={(el) => registerSectionRef?.(i, el)}
          style={{ marginBottom: isMobile ? 30 : 40, scrollMarginTop: 90 }}
        >
          <h2 style={sectionTitleStyle(isMobile)}>{section.title}</h2>
          <SectionBody section={section} isMobile={isMobile} />
        </section>
      ))}
    </>
  );
}

export interface RecapRetellViewProps {
  parts: RecapPart[];
  isMobile: boolean;
  registerSectionRef?: (index: number, el: HTMLElement | null) => void;
}

/** Вкладка «Подробно»: пронумерованные части полного пересказа. */
export function RecapRetellView({ parts, isMobile, registerSectionRef }: Readonly<RecapRetellViewProps>) {
  return (
    <>
      {parts.map((part, i) => (
        <section
          key={i}
          id={recapPartAnchorId(i)}
          ref={(el) => registerSectionRef?.(i, el)}
          style={{ display: "flex", gap: 18, marginBottom: isMobile ? 24 : 30, scrollMarginTop: 90 }}
        >
          <div style={{ width: 52, flexShrink: 0, textAlign: "right", paddingTop: 2 }}>
            <div style={{ fontFamily: fonts.display, fontSize: 30, color: colors.accent, lineHeight: 1 }}>
              {part.number}
            </div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.textDim }}>
              часть
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Paragraphs paragraphs={part.paragraphs} isMobile={isMobile} />
          </div>
        </section>
      ))}
    </>
  );
}
