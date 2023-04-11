export type BaseDomainEvent<Revision, Name, Body> = {
  revision: Revision;
  eventId: string;
  eventName: Name;
  eventCreatedAt: string;
  entityName: string;
  entityId: string;
  body: Body;
};
