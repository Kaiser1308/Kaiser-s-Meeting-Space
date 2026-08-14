export type MinutesTemplateId =
  'team' | 'one_to_one' | 'direct_report' | 'leadership' | 'recurring_review';

export const MINUTES_TEMPLATE_IDS = [
  'team',
  'one_to_one',
  'direct_report',
  'leadership',
  'recurring_review',
] as const satisfies readonly MinutesTemplateId[];

export const MINUTES_SECTION_IDS = [
  'context',
  'discussion',
  'viewpoints',
  'proposals',
  'agreements',
  'unresolvedItems',
  'decisions',
  'actions',
  'risks',
  'followUps',
] as const;

type MinutesSectionId = (typeof MINUTES_SECTION_IDS)[number];
type MinutesLanguage = 'vi' | 'en';
type MinutesDetailLevel = 'concise' | 'detailed';

export interface MinutesTemplateDefinitionV1 {
  readonly id: MinutesTemplateId;
  readonly version: 1;
  readonly title: string;
  readonly sections: readonly MinutesSectionId[];
  readonly promptRef: string;
  readonly schemaRef: string;
  readonly rubricRef: string;
  readonly languages: readonly MinutesLanguage[];
  readonly detailLevels: readonly MinutesDetailLevel[];
  readonly requiredSections: readonly MinutesSectionId[];
  readonly optionalSections: readonly MinutesSectionId[];
  readonly fields: readonly MinutesSectionId[];
  readonly evidenceRules: Readonly<{ requireCitations: boolean }>;
  readonly confirmationRules: Readonly<{ unknownValues: readonly ['needs_confirmation'] }>;
  readonly compatibility: Readonly<{ schemaVersion: string }>;
}

export interface TemplateRegistryOptions {
  readonly definitions: readonly unknown[];
  readonly references?: ReadonlySet<string> | readonly string[];
}

type TemplateInput = Partial<MinutesTemplateDefinitionV1> & Record<string, unknown>;

const ALL_FIELDS = [...MINUTES_SECTION_IDS] as const;
const DEFAULT_REQUIRED: Readonly<Record<MinutesTemplateId, readonly MinutesSectionId[]>> = {
  team: ['context', 'discussion', 'decisions', 'actions'],
  one_to_one: ['context', 'discussion', 'actions'],
  direct_report: ['context', 'discussion', 'decisions', 'actions'],
  leadership: ['context', 'discussion', 'decisions', 'risks'],
  recurring_review: ['context', 'discussion', 'decisions', 'actions'],
};
const REF_PATTERN = /^(prompt|schema|rubric):[a-z0-9][a-z0-9-]*:\d+(?:\.\d+)*$/;
const REF_FIELDS = ['promptRef', 'schemaRef', 'rubricRef'] as const;

const commonEvidenceRules = Object.freeze({ requireCitations: true });
const commonConfirmationRules = Object.freeze({
  unknownValues: ['needs_confirmation'] as const,
});

function enrich(
  definition: Omit<
    MinutesTemplateDefinitionV1,
    | 'requiredSections'
    | 'optionalSections'
    | 'fields'
    | 'evidenceRules'
    | 'confirmationRules'
    | 'compatibility'
  >,
  requiredSections: readonly MinutesSectionId[],
): MinutesTemplateDefinitionV1 {
  const optionalSections = definition.sections.filter(
    (section) => !requiredSections.includes(section),
  );
  return {
    ...definition,
    requiredSections,
    optionalSections,
    fields: ALL_FIELDS,
    evidenceRules: commonEvidenceRules,
    confirmationRules: commonConfirmationRules,
    compatibility: { schemaVersion: definition.schemaRef },
  };
}

export const DEFAULT_TEMPLATE_DEFINITIONS: readonly MinutesTemplateDefinitionV1[] = [
  enrich(
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
    DEFAULT_REQUIRED.team,
  ),
  enrich(
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
    DEFAULT_REQUIRED.one_to_one,
  ),
  enrich(
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
    DEFAULT_REQUIRED.direct_report,
  ),
  enrich(
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
    DEFAULT_REQUIRED.leadership,
  ),
  enrich(
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
    DEFAULT_REQUIRED.recurring_review,
  ),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUniqueStringArray(
  value: unknown,
  allowed: readonly string[],
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && allowed.includes(item)) &&
    new Set(value).size === value.length
  );
}

function validateDefinition(value: unknown): MinutesTemplateDefinitionV1 {
  if (!isRecord(value)) throw new Error('template definition must be an object');
  const definition = value as TemplateInput;
  if (!MINUTES_TEMPLATE_IDS.includes(definition.id as MinutesTemplateId))
    throw new Error('unknown minutes template id');
  if (definition.version !== 1) throw new Error('template version must be 1');
  if (typeof definition.title !== 'string' || definition.title.trim().length === 0)
    throw new Error('template title required');
  if (!isUniqueStringArray(definition.sections, MINUTES_SECTION_IDS))
    throw new Error('invalid template sections');
  if (!isUniqueStringArray(definition.requiredSections, MINUTES_SECTION_IDS))
    throw new Error('required template sections required');
  if (!Array.isArray(definition.optionalSections))
    throw new Error('optional template sections required');
  if (
    !definition.optionalSections.every(
      (section) =>
        typeof section === 'string' && MINUTES_SECTION_IDS.includes(section as MinutesSectionId),
    ) ||
    new Set(definition.optionalSections).size !== definition.optionalSections.length
  )
    throw new Error('invalid optional template sections');
  const sections = new Set(definition.sections);
  const required = new Set(definition.requiredSections);
  const optional = new Set(definition.optionalSections);
  if (
    [...required].some((section) => !sections.has(section)) ||
    [...optional].some((section) => !sections.has(section)) ||
    [...required].some((section) => optional.has(section)) ||
    sections.size !== required.size + optional.size
  )
    throw new Error('required and optional sections must partition sections');
  if (!isUniqueStringArray(definition.fields, MINUTES_SECTION_IDS))
    throw new Error('template fields required');
  if (
    !Array.isArray(definition.languages) ||
    definition.languages.length === 0 ||
    definition.languages.some((language) => language !== 'vi' && language !== 'en') ||
    new Set(definition.languages).size !== definition.languages.length
  )
    throw new Error('invalid template languages');
  if (
    !Array.isArray(definition.detailLevels) ||
    definition.detailLevels.length === 0 ||
    definition.detailLevels.some((level) => level !== 'concise' && level !== 'detailed') ||
    new Set(definition.detailLevels).size !== definition.detailLevels.length
  )
    throw new Error('invalid template detail levels');
  if (!isRecord(definition.evidenceRules) || definition.evidenceRules.requireCitations !== true)
    throw new Error('template evidence rules required');
  if (
    !isRecord(definition.confirmationRules) ||
    !Array.isArray(definition.confirmationRules.unknownValues) ||
    !definition.confirmationRules.unknownValues.includes('needs_confirmation')
  )
    throw new Error('template confirmation rules required');
  if (
    !isRecord(definition.compatibility) ||
    definition.compatibility.schemaVersion !== definition.schemaRef
  )
    throw new Error('template compatibility mismatch');
  for (const field of REF_FIELDS) {
    const ref = definition[field];
    const expectedKind = field.slice(0, -3);
    if (typeof ref !== 'string' || !REF_PATTERN.test(ref) || !ref.startsWith(`${expectedKind}:`))
      throw new Error('invalid artifact reference');
  }
  return {
    ...(definition as MinutesTemplateDefinitionV1),
    sections: Object.freeze([...definition.sections]) as readonly MinutesSectionId[],
    requiredSections: Object.freeze([
      ...definition.requiredSections,
    ]) as readonly MinutesSectionId[],
    optionalSections: Object.freeze([
      ...definition.optionalSections,
    ]) as readonly MinutesSectionId[],
    fields: Object.freeze([...definition.fields]) as readonly MinutesSectionId[],
    languages: Object.freeze([...definition.languages]) as readonly MinutesLanguage[],
    detailLevels: Object.freeze([...definition.detailLevels]) as readonly MinutesDetailLevel[],
    evidenceRules: Object.freeze({ requireCitations: true }),
    confirmationRules: Object.freeze({ unknownValues: ['needs_confirmation'] as const }),
    compatibility: Object.freeze({ schemaVersion: definition.schemaRef as string }),
  };
}

function normalizeReferences(value: ReadonlySet<string> | readonly string[] | undefined) {
  return value === undefined ? undefined : value instanceof Set ? value : new Set(value);
}

export class TemplateRegistry {
  private readonly byId: Map<MinutesTemplateId, MinutesTemplateDefinitionV1>;

  constructor(input: readonly unknown[] | TemplateRegistryOptions = DEFAULT_TEMPLATE_DEFINITIONS) {
    const definitions: readonly unknown[] = Array.isArray(input)
      ? input
      : (input as TemplateRegistryOptions).definitions;
    const references = normalizeReferences(
      Array.isArray(input) ? undefined : (input as TemplateRegistryOptions).references,
    );
    const ids = new Set<string>();
    const promptRefs = new Set<string>();
    const validated = definitions.map((definition) => {
      const valid = validateDefinition(definition);
      if (ids.has(valid.id)) throw new Error('duplicate template id/version');
      ids.add(valid.id);
      if (promptRefs.has(valid.promptRef)) throw new Error('duplicate template artifact reference');
      promptRefs.add(valid.promptRef);
      for (const ref of [valid.promptRef, valid.schemaRef, valid.rubricRef]) {
        if (references && !references.has(ref)) throw new Error('unresolved artifact reference');
      }
      return Object.freeze(valid);
    });
    if (ids.size !== MINUTES_TEMPLATE_IDS.length)
      throw new Error('template registry must define five templates');
    this.byId = new Map(validated.map((definition) => [definition.id, definition]));
  }

  list(): readonly MinutesTemplateDefinitionV1[] {
    return Object.freeze([...this.byId.values()]);
  }

  get(id: MinutesTemplateId): MinutesTemplateDefinitionV1 {
    const definition = this.byId.get(id);
    if (!definition) throw new Error('unknown minutes template');
    return definition;
  }
}
