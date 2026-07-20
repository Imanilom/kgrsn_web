import { useEffect } from "react";
import { useRouter } from "next/router";

export default function UploadPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/po/import");
  }, [router]);
  return null;
}
