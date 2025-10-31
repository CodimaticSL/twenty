export const canObjectBeManagedByWorkflow = ({
  nameSingular,
  isSystem,
}: {
  nameSingular: string;
  isSystem: boolean;
}) => {
  const excludedNonSystemObjectMetadataItemNames = [
    'workflow',
    'workflowVersion',
    'workflowRun',
    'dashboard',
  ];

  // Allow system objects for taskTarget and noteTarget
  const allowedSystemObjects = ['taskTarget', 'noteTarget'];

  return (
    !excludedNonSystemObjectMetadataItemNames.includes(nameSingular) &&
    (!isSystem || allowedSystemObjects.includes(nameSingular))
  );
};
