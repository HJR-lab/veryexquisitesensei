import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import axios from 'axios';

export default function AdminStudentDetail() {
  const navigate = useNavigate();
  const { email } = useParams();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [fees, setFees] = useState([]);
  const [updatingFeeId, setUpdatingFeeId] = useState(null);
  const [editForm, setEditForm] = useState({
    coursePurchaseCount: 0
  });

  useEffect(() => {
    loadStudentData();
  }, [email]);

  const loadStudentData = async () => {
    try {
      setLoading(true);
      const decodedEmail = decodeURIComponent(email);

      // Get student info
      const { data: studentData } = await axios.get(`/api/admin/students/${decodedEmail}`);
      setStudent(studentData);
      setEditForm({
        coursePurchaseCount: studentData.course_purchase_count || 0
      });

      // Get student bookings
      const { data: bookingsData } = await axios.get(`/api/admin/students/${decodedEmail}/bookings`);
      setBookings(bookingsData || []);

      // Get student fees
      if (studentData.id) {
        const { data: feesData } = await axios.get(`/api/admin/students/${studentData.id}/fees`);
        setFees(feesData.fees || []);
      }
    } catch (error) {
      console.error('Failed to load student data:', error);
      alert('Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  const saveChanges = async () => {
    try {
      setSaving(true);
      const decodedEmail = decodeURIComponent(email);

      await axios.put(`/api/admin/students/${decodedEmail}`, {
        course_purchase_count: parseInt(editForm.coursePurchaseCount)
      });

      alert('Student updated successfully!');
      await loadStudentData();
    } catch (error) {
      console.error('Failed to update student:', error);
      alert('Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  const updateFeeStatus = async (feeId, newStatus) => {
    if (!confirm(`Are you sure you want to mark this fee as ${newStatus}?`)) {
      return;
    }

    try {
      setUpdatingFeeId(feeId);
      await axios.patch(`/api/admin/fees/${feeId}/payment`, {
        paymentStatus: newStatus
      });

      alert(`Fee marked as ${newStatus}!`);
      await loadStudentData();
    } catch (error) {
      console.error('Failed to update fee:', error);
      alert('Failed to update fee');
    } finally {
      setUpdatingFeeId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Loading...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Student not found</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/students')}
            className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors mb-6"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span>Back to Students</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">
                {student.first_name} {student.last_name}
              </h1>
              <p className="text-text-muted">{student.email}</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info Card */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Student Information</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer Type</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                    {student.customer_type || 'student'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Courses Purchased</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.coursePurchaseCount}
                    onChange={(e) => setEditForm({ ...editForm, coursePurchaseCount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shopify Customer ID</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 font-mono text-sm">
                    {student.shopify_customer_id || 'N/A'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Created</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">
                    {new Date(student.created_at).toLocaleDateString()}
                  </div>
                </div>

                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Bookings Card */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Class Bookings ({bookings.length})</h2>

              {bookings.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No bookings found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Course</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Attended</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking, index) => (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                              {booking.course_identifier || 'N/A'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {new Date(booking.class_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              booking.status === 'completed' ? 'bg-green-100 text-green-800' :
                              booking.status === 'booked' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {booking.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {booking.attended !== null ? (
                              <span className={`text-sm ${booking.attended ? 'text-green-600' : 'text-red-600'}`}>
                                {booking.attended ? '✓ Yes' : '✗ No'}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fees Card - Full Width */}
        {fees.length > 0 && (
          <div className="mt-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Reschedule Fees</h2>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-gray-600">Total Pending:</span>
                    <span className="ml-2 font-bold text-red-600">
                      ${fees.filter(f => f.payment_status === 'pending').reduce((sum, f) => sum + parseFloat(f.amount), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Total Paid:</span>
                    <span className="ml-2 font-bold text-green-600">
                      ${fees.filter(f => f.payment_status === 'paid').reduce((sum, f) => sum + parseFloat(f.amount), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Fee Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Type</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Amount</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Notes</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <tr key={fee.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-600 text-sm">
                          {formatDate(fee.fee_date)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                            {fee.fee_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          ${parseFloat(fee.amount).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                            fee.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                            fee.payment_status === 'waived' ? 'bg-gray-100 text-gray-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {fee.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-sm max-w-xs truncate">
                          {fee.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {fee.payment_status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => updateFeeStatus(fee.id, 'paid')}
                                disabled={updatingFeeId === fee.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                <span>Mark Paid</span>
                              </button>
                              <button
                                onClick={() => updateFeeStatus(fee.id, 'waived')}
                                disabled={updatingFeeId === fee.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                <span>Waive</span>
                              </button>
                            </div>
                          )}
                          {fee.payment_status === 'paid' && fee.payment_date && (
                            <span className="text-xs text-gray-500">
                              Paid {formatDate(fee.payment_date)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
