// The slide object model is the canonical contract from @nova/dsl. The renderer
// no longer vendors its own copy; it re-exports the DSL types here so the public
// `@nova/renderer/types` surface stays intact.
export * from '@nova/dsl';
export * from './effects';
