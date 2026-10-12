# System Architecture

## Layers

1.  Edge/API
2.  Identity/authorization
3.  Application/use cases
4.  Domain/policies
5.  Events/workflows
6.  Integrations
7.  Workers
8.  Persistence/search/storage
9.  Audit/observability

## Backend layout

``` text
src/
  config/
  api/{routes,controllers,validators,serializers}
  application/{services,use-cases,workflows}
  domain/{entities,value-objects,policies,interfaces}
  infrastructure/{database,repositories,integrations,queues,search,storage,cache}
  workers/
  events/
  security/
  middleware/
  observability/
  utils/
  tests/
```

## Request path

`Client → Gateway/LB → Express → validation → authentication → authorization → use case → domain policy → repository/service → event → response`

## Async path

`Source → Connector → Queue/Event → Worker → Normalize → Correlate → Enrich → Persist → Index → Risk → Workflow/Notification`

Domain code must not depend on Express or MongoDB. Infrastructure
implements interfaces.
