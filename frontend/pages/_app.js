import "@/styles/globals.css";
import Layout from "@/components/Layout";
import { useRouter } from "next/router";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const getLayout = Component.getLayout || ((page) => (
    <Layout title={Component.title} subtitle={Component.subtitle}>
      {page}
    </Layout>
  ));
  return getLayout(<Component {...pageProps} />);
}
