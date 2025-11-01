import Navigation from '../components/Navigation';

export default function Contact() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-6 md:px-desktop-x py-12">
          <h1 className="text-4xl font-serif text-text mb-8">Contact Us</h1>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Left Column - Contact Information */}
            <div>
              <h2 className="text-2xl font-serif text-text mb-6">Get in Touch</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-text mb-2">Studio Location</h3>
                  <p className="text-text-muted">
                    <a
                      href="https://maps.google.com/?q=75+Jalan+Kelabu+Asap+Singapore+278268"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-text transition-colors underline"
                    >
                      75 Jalan Kelabu Asap<br />
                      Singapore 278268<br />
                      Holland Village
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-text mb-2">Operating Hours</h3>
                  <p className="text-text-muted">
                    <span className="font-semibold text-secondary">BY APPOINTMENT ONLY</span><br />
                    Monday - Friday: 11:00 AM - 5:00 PM<br />
                    Saturday - Sunday: 10:00 AM - 5:00 PM
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-text mb-2">Contact</h3>
                  <div className="space-y-3">
                    <a href="mailto:info@ves.sg" className="flex items-center gap-3 text-text-muted hover:text-text transition-colors group">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                      <span>info@ves.sg</span>
                    </a>
                    <a href="https://instagram.com/ves.studio" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-text-muted hover:text-text transition-colors group">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      <span>@ves.studio</span>
                    </a>
                    <a href="https://facebook.com/ves.studio" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-text-muted hover:text-text transition-colors group">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <span>ves.studio</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Map */}
            <div>
              <div className="w-full aspect-square border border-border">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3988.7733746988787!2d103.79587431475393!3d1.3085900620449585!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31da1a19d5c6c5e5%3A0x5c6c5e5c5e5c5e5!2s75%20Jalan%20Kelabu%20Asap%2C%20Singapore%20278268!5e0!3m2!1sen!2ssg!4v1234567890123!5m2!1sen!2ssg"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="VES Studio Location"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
