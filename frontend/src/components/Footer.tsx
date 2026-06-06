export default function Footer() {
  return (
    <footer className="mt-16 border-t border-surface-border bg-surface">
      <div className="max-w-7xl mx-auto px-4 py-6 text-center space-y-2">
        <p className="text-xs text-gray-400">
          (C)MOE K.K. (C)Konami Digital Entertainment 株式会社MOE及び株式会社コナミデジタルエンタテインメントの著作権を侵害する行為は禁止されています。
        </p>
        <p className="text-xs text-gray-600">
          <a
            href="http://moepic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 underline"
          >
            Master of Epic 公式サイト
          </a>
        </p>
      </div>
    </footer>
  )
}
