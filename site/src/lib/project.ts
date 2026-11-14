import packageJson from '../../../package.json' with { type: 'json' };

function repositoryWebUrl(gitUrl: string): string {
  const match = /^git\+(https:\/\/github\.com\/[^/]+\/[^/]+?)\.git$/.exec(gitUrl);
  if (!match?.[1]) throw new Error(`Unexpected repository URL in package.json: ${gitUrl}`);
  return match[1];
}

const repository = repositoryWebUrl(packageJson.repository.url);

export const project = {
  name: 'Archimaid',
  packageName: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  licenseId: packageJson.license,
  repository,
  issues: packageJson.bugs.url,
  newIssue: `${repository}/issues/new/choose`,
  contributing: `${repository}/blob/main/CONTRIBUTING.md`,
  changelog: `${repository}/blob/main/CHANGELOG.md`,
  license: `${repository}/blob/main/LICENSE`,
  reference: `${repository}/blob/main/docs/reference.md`,
  readme: `${repository}#readme`,
  npm: `https://www.npmjs.com/package/${packageJson.name}`,
  playground: 'https://try.archimaid.org',
} as const;
