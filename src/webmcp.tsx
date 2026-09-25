import { useEffect, useRef } from "react";
import type { Content, StudyState } from "./types";
import { generateQueue, localDate, planDay, readiness } from "./domain";
type Props = {
  content: Content;
  state: StudyState;
  commit: (f: (s: StudyState) => StudyState) => Promise<void>;
};
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
export function AgentActions(props: Props) {
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const empty = (input: unknown) => {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw Error("Expected an empty object.");
    };
    const schema = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    const tools: Tool[] = [
      {
        name: "read_study_summary",
        title: "讀取學習摘要",
        description:
          "Read current day, core progress and provisional readiness. Does not change records.",
        inputSchema: schema,
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          empty(input);
          const { state: s, content: c } = current.current,
            r = readiness(s, c);
          return {
            day: planDay(s),
            coreLearned: r.learned,
            coreTotal: r.coreCount,
            provisionalReadiness: r.score,
            officialExamProfileConfirmed: false,
          };
        },
      },
      {
        name: "start_today_study_tasks",
        title: "開始今日學習任務",
        description:
          "Create today’s task queue if absent and navigate to it. Does not mark learning complete or answer questions.",
        inputSchema: schema,
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          empty(input);
          const { content: c, commit } = current.current;
          await commit((s) => {
            if (!s.queues.some((q) => q.date === localDate()))
              s.queues.push(generateQueue(s, c));
            s.settings.setupComplete = true;
            return s;
          });
          location.hash = "/task";
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { status: "started", route: "/task" };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability; normal UI remains available. */
      }
    }
    return () => lifecycle.abort();
  }, []);
  return null;
}
