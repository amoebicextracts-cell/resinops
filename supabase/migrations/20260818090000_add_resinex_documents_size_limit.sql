begin;

-- Storage-enforced 25MB cap on resinex-documents, matching the existing
-- frontend check in ProjectDocuments.jsx (MAX_FILE_MB). Without this the
-- limit only lived in the browser -- a caller who skipped the UI and hit
-- /api/resinex-create-upload-url directly could push arbitrarily large
-- files through the signed upload URL, since createSignedUploadUrl itself
-- enforces no size cap.
update storage.buckets
set file_size_limit = 26214400 -- 25 MiB
where id = 'resinex-documents';

commit;
