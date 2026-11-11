UPDATE workflow_documents
SET document_json = json_set(
  document_json,
  '$.nodes',
  (
    SELECT json_group_array(json_remove(node.value, '$.inputSchema'))
    FROM json_each(workflow_documents.document_json, '$.nodes') AS node
  ),
  '$.edges',
  (
    SELECT json_group_array(json_remove(edge.value, '$.targetPort'))
    FROM json_each(workflow_documents.document_json, '$.edges') AS edge
  )
)
WHERE EXISTS (
  SELECT 1
  FROM json_each(workflow_documents.document_json, '$.nodes') AS node
  WHERE json_type(node.value, '$.inputSchema') IS NOT NULL
)
OR EXISTS (
  SELECT 1
  FROM json_each(workflow_documents.document_json, '$.edges') AS edge
  WHERE json_type(edge.value, '$.targetPort') IS NOT NULL
);
