import swagger from '@apidevtools/swagger-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import { OpenAPI, OpenAPIV3 } from 'openapi-types';
import path from 'path';

const SPEC_FILE =
  'https://raw.githubusercontent.com/magicbell-io/public/main/openapi/spec/openapi.json';

export const CACHE_FILE = 'node_modules/.cache/magicbell/openapi.json';

const canUseCacheFile = (file: string, maxAge: number) => {
  const now = new Date().getTime();
  const expires = new Date(now - maxAge);

  try {
    return fs.statSync(file).mtime > expires;
  } catch {
    return false;
  }
};

const writeCacheFile = (file: string, data: Record<string, unknown>) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

const readCacheFile = (file: string) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
};

const defaultOptions = { force: false, dereference: false };
export async function fetchOpenAPISpec(
  options: Partial<typeof defaultOptions> = defaultOptions,
): Promise<OpenAPIV3.Document> {
  options = { ...defaultOptions, ...options };
  let json = readCacheFile(CACHE_FILE);

  const forceFetch = options.force || !json;

  if (forceFetch || !canUseCacheFile(CACHE_FILE, 5 * 60 * 1000)) {
    try {
      console.log(`fetching openapi spec from ${SPEC_FILE}`);
      const promise = fetch(SPEC_FILE).then((x) => x.json());
      promise.then((data) => {
        writeCacheFile(CACHE_FILE, data as Record<string, unknown>);
        json = data;
        console.log('refreshed', typeof json);
      });

      // if we have a cached version we'll refetch in the background, unless the refresh is forced
      if (forceFetch) await promise;
    } catch (e) {
      console.error('failed to fetch fresh openapi spec file', e);
    }
  }

  if (!json) {
    throw new Error(
      'Failed to obtain openapi spec from the web or cache, please connect to the internet and run `yarn refresh-openapi` (or refresh this page) to fetch the spec from our openapi repo, and store it in cache.',
    );
  }

  const schema = (await swagger.parse(
    json as OpenAPI.Document,
  )) as unknown as OpenAPIV3.Document;

  if (options.dereference) {
    return (await swagger.dereference(schema)) as unknown as OpenAPIV3.Document;
  }

  return schema;
}

export function getApiLinks(spec: OpenAPIV3.Document) {
  return Object.keys(spec.paths).flatMap((pathName) => {
    const path = spec.paths[pathName as keyof typeof spec.paths] || {};

    return Object.keys(path).map((method) => {
      const { operationId, summary } = path[
        method as keyof typeof path
      ] as OpenAPIV3.OperationObject;

      return { path: pathName, method, operationId, summary };
    });
  });
}
