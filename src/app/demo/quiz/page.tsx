import { Badge, Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { demoQuizHistory } from "../data";
import { DemoQuiz } from "./demo-quiz";

export const metadata = { title: "Quiz" };

export default function DemoQuizPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="About JD Foods quiz" description="Pass mark 80%. A real attempt draws 6 random questions from the bank; this preview shows 3." />
      <DemoQuiz />
      <Card className="mt-6">
        <CardTitle>Your quiz history</CardTitle>
        <Table className="min-w-0">
          <thead><tr><Th>Quiz</Th><Th>Date</Th><Th>Score</Th><Th>Result</Th></tr></thead>
          <tbody>
            {demoQuizHistory.map((a, i) => (
              <tr key={i}>
                <Td>{a.quiz}</Td>
                <Td>{formatDate(a.date, true)}</Td>
                <Td>{a.score}%</Td>
                <Td>{a.passed ? <Badge tone="success">passed</Badge> : <Badge tone="danger">not passed</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
