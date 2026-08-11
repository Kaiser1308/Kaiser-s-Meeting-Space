export type MinutesTemplateId =
  'team' | 'one_to_one' | 'direct_report' | 'leadership' | 'recurring_review';
export interface MinutesTemplateDefinitionV1 {
  readonly id: MinutesTemplateId;
  readonly version: 1;
  readonly title: string;
  readonly sections: readonly string[];
  readonly promptRef: string;
  readonly schemaRef: string;
  readonly rubricRef: string;
  readonly languages: readonly ('vi' | 'en')[];
  readonly detailLevels: readonly ('concise' | 'detailed')[];
}
const definitions: readonly MinutesTemplateDefinitionV1[] = [
  {
    id: 'team',
    version: 1,
    title: 'Team Meeting',
    sections: ['context', 'discussion', 'decisions', 'actions', 'risks', 'followUps'],
    promptRef: 'prompt:minutes-team:1',
    schemaRef: 'schema:detailed-minutes:1',
    rubricRef: 'rubric:minutes:1',
    languages: ['vi', 'en'],
    detailLevels: ['concise', 'detailed'],
  },
  {
    id: 'one_to_one',
    version: 1,
    title: 'One to One',
    sections: ['context', 'discussion', 'viewpoints', 'actions', 'followUps'],
    promptRef: 'prompt:minutes-one-to-one:1',
    schemaRef: 'schema:detailed-minutes:1',
    rubricRef: 'rubric:minutes:1',
    languages: ['vi', 'en'],
    detailLevels: ['concise', 'detailed'],
  },
  {
    id: 'direct_report',
    version: 1,
    title: 'Direct Report',
    sections: ['context', 'discussion', 'decisions', 'actions', 'risks'],
    promptRef: 'prompt:minutes-direct-report:1',
    schemaRef: 'schema:detailed-minutes:1',
    rubricRef: 'rubric:minutes:1',
    languages: ['vi', 'en'],
    detailLevels: ['detailed'],
  },
  {
    id: 'leadership',
    version: 1,
    title: 'Leadership Review',
    sections: [
      'context',
      'discussion',
      'proposals',
      'agreements',
      'decisions',
      'risks',
      'followUps',
    ],
    promptRef: 'prompt:minutes-leadership:1',
    schemaRef: 'schema:detailed-minutes:1',
    rubricRef: 'rubric:minutes:1',
    languages: ['vi', 'en'],
    detailLevels: ['detailed'],
  },
  {
    id: 'recurring_review',
    version: 1,
    title: 'Recurring Review',
    sections: ['context', 'discussion', 'decisions', 'actions', 'risks', 'followUps'],
    promptRef: 'prompt:minutes-recurring-review:1',
    schemaRef: 'schema:detailed-minutes:1',
    rubricRef: 'rubric:minutes:1',
    languages: ['vi', 'en'],
    detailLevels: ['concise', 'detailed'],
  },
];
export class TemplateRegistry {
  private readonly byId = new Map(
    definitions.map((definition) => [definition.id, Object.freeze({ ...definition })]),
  );
  list() {
    return [...this.byId.values()];
  }
  get(id: MinutesTemplateId) {
    const definition = this.byId.get(id);
    if (!definition) throw new Error('unknown minutes template');
    return definition;
  }
}
