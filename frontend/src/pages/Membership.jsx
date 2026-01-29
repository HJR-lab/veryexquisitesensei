import { useState, useEffect } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';

const API_URL = 'http://localhost:3000';

export default function Membership() {
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembership();
  }, []);

  const fetchMembership = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_URL}/api/membership/my-membership`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.hasMembership) {
        setMembership(response.data.membership);
      }
    } catch (error) {
      console.error('Error fetching membership:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Active Membership Status (if member) */}
          {!loading && membership && (
            <div className={`${membership.type === '12 Month' ? 'bg-gradient-to-r from-yellow-500/20 via-yellow-600/10 to-accent/10 border-2 border-yellow-600' : 'bg-gradient-to-r from-accent/10 to-accent/5 border-2 border-accent'} p-8`}>
              <div className="flex items-start gap-4">
                <div className={`w-20 h-20 ${membership.type === '12 Month' ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-accent'} text-white flex items-center justify-center shrink-0 shadow-lg`}>
                  <span className="material-symbols-outlined text-5xl">workspace_premium</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className={`text-3xl font-black uppercase ${membership.type === '12 Month' ? 'text-yellow-700' : ''}`}>
                      {membership.type === '12 Month' ? 'Premium Member' : 'Active Member'}
                    </h2>
                    <span className={`px-4 py-1.5 ${membership.type === '12 Month' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' : 'bg-accent'} text-white text-sm font-bold uppercase shadow-md`}>
                      {membership.type}
                    </span>
                  </div>
                  <p className="text-text-muted mb-4 text-lg">
                    {membership.type === '12 Month'
                      ? 'You are a premium member with exclusive access to all studio perks and priority benefits.'
                      : 'Your membership is active and giving you access to all studio perks and facilities.'}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-background border border-border p-4">
                      <p className="text-sm text-text-muted mb-1">Membership Expiry</p>
                      <p className="font-bold text-lg">{formatDate(membership.endDate)}</p>
                      <p className="text-sm text-accent font-medium mt-1">{membership.daysRemaining} days remaining</p>
                    </div>
                    <div className="bg-background border border-border p-4">
                      <p className="text-sm text-text-muted mb-1">Member Since</p>
                      <p className="font-bold text-lg">{formatDate(membership.startDate)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="font-bold mb-2 uppercase text-sm">Your Membership Perks:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {membership.perks && Object.entries(membership.perks).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-accent text-lg">check_circle</span>
                          <span className="text-sm">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Only show membership options if NOT a member */}
          {!membership && (
            <>
              {/* Header */}
              <div className="text-center space-y-4">
                <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tighter uppercase">
                  VES Clay Club
                </h1>
                <p className="text-xl text-text-muted max-w-3xl mx-auto">
                  Unlimited studio access with flexible membership plans
                </p>
              </div>

              {/* Membership Tiers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1 Month Membership */}
            <a
              href="https://ves.sg/products/ves-clay-club-studio-access?selling_plan=1864204446&variant=44974901362846"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-background-alt border border-border p-6 space-y-4 hover:border-accent transition-colors cursor-pointer block"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-accent/10 border border-accent mb-4">
                  <span className="material-symbols-outlined text-accent text-3xl">calendar_today</span>
                </div>
                <h3 className="text-2xl font-bold mb-2 uppercase">1 Month</h3>
                <div className="text-3xl font-black text-accent mb-1">$350</div>
                <p className="text-text-muted text-sm">Perfect for trying us out</p>
              </div>
              <ul className="space-y-3 pt-4 border-t border-border">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Unlimited studio access</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Free dedicated storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Studio-assisted clay reclaim</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Cancel anytime</span>
                </li>
              </ul>
            </a>

            {/* 6 Month Membership */}
            <a
              href="https://ves.sg/products/ves-clay-club-studio-access?variant=44974901428382&selling_plan=1345323166"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-background-alt border border-border p-6 space-y-4 hover:border-accent transition-colors cursor-pointer block"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-accent/10 border border-accent mb-4">
                  <span className="material-symbols-outlined text-accent text-3xl">date_range</span>
                </div>
                <h3 className="text-2xl font-bold mb-2 uppercase">6 Months</h3>
                <div className="space-y-1">
                  <div className="text-3xl font-black text-accent">$1,260</div>
                  <div className="text-sm text-text-muted line-through">$2,100</div>
                  <div className="inline-block bg-accent/10 text-accent border border-accent px-3 py-1 text-xs font-bold">
                    SAVE $840
                  </div>
                </div>
                <p className="text-text-muted text-sm mt-2">Great value for committed potters</p>
              </div>
              <ul className="space-y-3 pt-4 border-t border-border">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Unlimited studio access</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Free dedicated storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Studio-assisted clay reclaim</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">FREE 1 Firing ($90)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">All studio glazes included</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">10% off clay, tools & firing</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Cancel anytime</span>
                </li>
              </ul>
            </a>

            {/* 12 Month Membership */}
            <a
              href="https://ves.sg/products/ves-clay-club-studio-access?variant=44974901461150&selling_plan=3259367582"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-background-alt border-2 border-accent p-6 space-y-4 relative hover:bg-accent/5 transition-colors cursor-pointer block"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white px-4 py-1 text-xs font-bold">
                BEST VALUE
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-accent/10 border border-accent mb-4">
                  <span className="material-symbols-outlined text-accent text-3xl">event_note</span>
                </div>
                <h3 className="text-2xl font-bold mb-2 uppercase">12 Months</h3>
                <div className="space-y-1">
                  <div className="text-3xl font-black text-accent">$1,995</div>
                  <div className="text-sm text-text-muted line-through">$4,200</div>
                  <div className="inline-block bg-accent/10 text-accent border border-accent px-3 py-1 text-xs font-bold">
                    SAVE $2,205
                  </div>
                </div>
                <p className="text-text-muted text-sm mt-2">Maximum savings + extras</p>
              </div>
              <ul className="space-y-3 pt-4 border-t border-border">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Unlimited studio access</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Free dedicated storage</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Studio-assisted clay reclaim</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">FREE $130 Firing Basket</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">All studio glazes included</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm font-bold">10% off clay, tools & firing</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-xl">check_circle</span>
                  <span className="text-sm">Cancel anytime</span>
                </li>
              </ul>
            </a>
          </div>

          {/* What's Included */}
          <div className="bg-background-alt border border-border p-6">
            <h3 className="text-2xl font-bold mb-6 uppercase">What's Included in Every Membership</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
              <div className="md:row-span-2">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-accent text-2xl mt-0.5">calendar_today</span>
                  <div>
                    <h4 className="font-bold mb-1">Studio Access Everyday</h4>
                    <p className="text-sm text-text-muted mb-1">
                      Open 7 days a week with flexible hours to fit your schedule.
                    </p>
                    <div className="space-y-0 text-xs">
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Monday</span>
                        <span className="font-medium text-right">11:00 AM – 9:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Tuesday</span>
                        <span className="font-medium text-right">10:00 AM – 6:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Wednesday</span>
                        <span className="font-medium text-right">10:00 AM – 6:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Thursday</span>
                        <span className="font-medium text-right">10:00 AM – 6:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Friday</span>
                        <span className="font-medium text-right">12:00 PM – 9:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Saturday</span>
                        <span className="font-medium text-right">4:00 PM – 9:00 PM</span>
                      </div>
                      <div className="py-0.5 px-1.5 flex justify-between">
                        <span className="font-medium">Sunday</span>
                        <span className="font-medium text-right">12:00 PM – 9:00 PM</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-accent text-2xl mt-0.5">all_inclusive</span>
                <div>
                  <h4 className="font-bold mb-1">Unlimited Studio Access</h4>
                  <p className="text-sm text-text-muted">
                    Work at your own pace with unlimited access during studio hours. Practice your craft whenever inspiration strikes.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-accent text-2xl mt-0.5">train</span>
                <div>
                  <h4 className="font-bold mb-1">Convenient Location</h4>
                  <p className="text-sm text-text-muted">
                    Located just ~4 minutes walk from Holland Village MRT. Easy access for all your pottery sessions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-accent text-2xl mt-0.5">inventory_2</span>
                <div>
                  <h4 className="font-bold mb-1">Free Dedicated Storage</h4>
                  <p className="text-sm text-text-muted">
                    Secure storage space for your works in progress, finished pieces, and personal tools throughout your membership.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-accent text-2xl mt-0.5">recycling</span>
                <div>
                  <h4 className="font-bold mb-1">Studio-Assisted Clay Reclaim</h4>
                  <p className="text-sm text-text-muted">
                    Our studio team helps you reclaim your clay scraps, reducing waste and saving money. Environmentally friendly and economical.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 12-Month Exclusive Benefits */}
          <div className="bg-accent/10 border border-accent p-6">
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 uppercase">
              <span className="material-symbols-outlined text-accent text-3xl">workspace_premium</span>
              12-Month Membership Exclusive Benefits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-background border border-border p-4">
                <div className="text-accent text-4xl mb-2">
                  <span className="material-symbols-outlined text-5xl">local_fire_department</span>
                </div>
                <h4 className="font-bold mb-1">FREE $130 Firing Basket</h4>
                <p className="text-sm text-text-muted">Complimentary firing credits worth $130</p>
              </div>
              <div className="bg-background border border-border p-4">
                <div className="text-accent text-4xl mb-2">
                  <span className="material-symbols-outlined text-5xl">palette</span>
                </div>
                <h4 className="font-bold mb-1">Studio Glazes Included</h4>
                <p className="text-sm text-text-muted">Access to all our professional studio glazes</p>
              </div>
              <div className="bg-background border border-border p-4">
                <div className="text-accent text-4xl mb-2">
                  <span className="material-symbols-outlined text-5xl">sell</span>
                </div>
                <h4 className="font-bold mb-1">10% Discount</h4>
                <p className="text-sm text-text-muted">Save on clay, tools, and additional firing services</p>
              </div>
            </div>
          </div>

          {/* Flexible Cancellation */}
          <div className="bg-background-alt border border-border p-6 text-center">
            <span className="material-symbols-outlined text-accent text-5xl mb-3 inline-block">verified</span>
            <h3 className="text-xl font-bold mb-2 uppercase">Flexible & Commitment-Free</h3>
            <p className="text-text-muted">
              All memberships can be cancelled anytime. No hidden fees, no long-term commitments.
            </p>
          </div>

          {/* CTA */}
          <div className="bg-accent/10 border border-accent p-8 text-center">
            <h3 className="text-2xl font-bold mb-3 uppercase">Ready to Join VES Clay Club?</h3>
            <p className="text-text-muted mb-6 max-w-2xl mx-auto">
              Start your pottery journey with unlimited studio access. Choose the membership plan that works best for you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/classes"
                className="inline-flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-12 px-6 bg-accent text-white text-base font-bold leading-normal tracking-wide hover:bg-accent/90 transition-colors uppercase"
              >
                <span className="truncate">Browse Classes</span>
              </a>
              <a
                href="mailto:info@ves.sg"
                className="inline-flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-12 px-6 bg-border text-text text-base font-bold leading-normal tracking-wide hover:bg-border/80 transition-colors uppercase"
              >
                <span className="truncate">Contact Us</span>
              </a>
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      <footer className="bg-background-alt border-t border-border text-center py-8 mt-16">
        <p className="text-sm text-text-muted">VES Pottery Studio - Holland Village</p>
      </footer>
    </div>
  );
}
