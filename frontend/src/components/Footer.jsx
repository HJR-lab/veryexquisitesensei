export default function Footer() {
  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-6 md:px-desktop-x py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-serif text-text mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a href="/classes" className="text-sm text-text-muted hover:text-text transition-colors">
                  Classes
                </a>
              </li>
              <li>
                <a href="/membership" className="text-sm text-text-muted hover:text-text transition-colors">
                  Membership
                </a>
              </li>
              <li>
                <a href="/contact" className="text-sm text-text-muted hover:text-text transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-serif text-text mb-4">Contact</h3>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>
                <a href="mailto:info@ves.sg" className="hover:text-text transition-colors">
                  info@ves.sg
                </a>
              </li>
              <li>75 Jalan Kelabu Asap</li>
              <li>Singapore 278268</li>
              <li>
                <a href="https://instagram.com/ves.studio" target="_blank" rel="noopener noreferrer" className="hover:text-text transition-colors">
                  @ves.studio
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-text-muted">
          <p>&copy; {new Date().getFullYear()} VES Pottery Studio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
