import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import UploadForm from "../components/upload-form";

export default function UploadPage() {
  return (
    <Shell>
      <PageHeader title="Загрузка книг" />
      <UploadForm />
    </Shell>
  );
}
