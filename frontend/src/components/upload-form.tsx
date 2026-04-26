import { useUploadGroups } from "./upload-form.hook";
import UploadDropZone from "./upload-form/UploadDropZone";
import UploadGroupCard from "./upload-form/UploadGroupCard";
import UploadActions from "./upload-form/UploadActions";

export default function UploadForm() {
  const {
    groups, saving, saved, mergeSource,
    handleFiles, removeFile, removeGroup, saveAll,
    setMergeSource, mergeInto, setDuplicateAction,
    cancelAll, resetSaved,
  } = useUploadGroups();

  const readyCount = groups.filter((g) => g.files.some((f) => f.status === "ready")).length;
  const uploading = groups.some((g) => g.files.some((f) => f.status === "uploading"));

  return (
    <div style={{ maxWidth: 700 }}>
      <UploadDropZone groupsCount={groups.length} onFiles={handleFiles} />

      {/* Book groups */}
      {groups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => (
            <UploadGroupCard
              key={g.key}
              group={g}
              isMergeSource={mergeSource === g.key}
              isMergeTarget={!!mergeSource && mergeSource !== g.key}
              showMergeButton={groups.length > 1}
              onStartMerge={() => setMergeSource(g.key)}
              onCancelMerge={() => setMergeSource(null)}
              onPickAsTarget={() => mergeInto(g.key)}
              onRemoveGroup={() => removeGroup(g.key)}
              onRemoveFile={removeFile}
              onSetDuplicateAction={(action) => setDuplicateAction(g.key, action)}
            />
          ))}

          <UploadActions
            saved={saved}
            saving={saving}
            uploading={uploading}
            readyCount={readyCount}
            saveDisabledExtra={groups.some((g) => g.duplicate && !g.duplicateAction)}
            onSave={saveAll}
            onCancel={cancelAll}
            onResetSaved={resetSaved}
          />
        </div>
      )}
    </div>
  );
}
