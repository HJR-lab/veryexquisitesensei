import { useState, useEffect } from 'react';
import api from '../utils/api';

const API_URL = 'http://localhost:3000';

// Using admin design colors
const ADMIN_PRIMARY = '#D37D63';

export default function AdminCoursesNew() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [formData, setFormData] = useState({
    classType: '',
    instructor: '',
    description: '',
    maxCapacity: '',
    classDate: '',
    startTime: '',
    endTime: '',
    room: ''
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`${API_URL}/api/classes/available`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCourses(response.data.classes || []);
      if (response.data.classes?.length > 0) {
        selectCourse(response.data.classes[0]);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const selectCourse = (course) => {
    setSelectedCourse(course);
    setFormData({
      classType: course.classType || '',
      instructor: course.instructor || '',
      description: course.description || '',
      maxCapacity: course.maxCapacity || '',
      classDate: course.classDate ? course.classDate.split('T')[0] : '',
      startTime: course.startTime || '',
      endTime: course.endTime || '',
      room: course.room || ''
    });
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      await api.put(`${API_URL}/api/classes/${selectedCourse.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert('Course saved successfully!');
      fetchCourses();
    } catch (error) {
      console.error('Error saving course:', error);
      alert('Failed to save course');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) return;

    try {
      const token = localStorage.getItem('token');
      await api.delete(`${API_URL}/api/classes/${selectedCourse.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert('Course deleted successfully!');
      fetchCourses();
      setSelectedCourse(null);
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Failed to delete course');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#211911', color: '#F8F5F2' }}>
      {/* Sidebar */}
      <aside className="w-1/3 max-w-sm flex flex-col p-6" style={{ borderRight: `1px solid #4A4441` }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-12" style={{
            backgroundImage: `url('https://via.placeholder.com/48')`
          }} />
          <div className="flex flex-col">
            <h1 className="text-lg font-bold">Clay Studio Admin</h1>
            <p className="text-gray-400 text-sm">admin@claystudio.com</p>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Courses</h2>
          <button
            className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-white text-sm font-bold leading-normal tracking-[0.015em]"
            style={{ backgroundColor: ADMIN_PRIMARY }}
          >
            <span className="material-symbols-outlined">add</span>
            <span className="truncate">Add New Course</span>
          </button>
        </div>

        <div className="flex-grow space-y-2 overflow-y-auto">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => selectCourse(course)}
              className={`p-4 rounded-lg cursor-pointer ${
                selectedCourse?.id === course.id
                  ? 'border'
                  : 'hover:bg-gray-800'
              }`}
              style={selectedCourse?.id === course.id ? {
                backgroundColor: `${ADMIN_PRIMARY}30`,
                borderColor: ADMIN_PRIMARY
              } : {}}
            >
              <h3 className="font-bold">{course.classType}</h3>
              <p className="text-sm text-gray-400">{course.instructor}</p>
            </div>
          ))}
        </div>

        <button
          onClick={handleLogout}
          className="flex min-w-[84px] items-center justify-center gap-2 mt-auto rounded-lg h-10 px-4 bg-gray-700 text-sm font-bold leading-normal tracking-[0.015em]"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="truncate">Logout</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="w-2/3 flex-1 p-8 overflow-y-auto">
        {selectedCourse ? (
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <p className="text-4xl font-black leading-tight tracking-tight">{selectedCourse.classType}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium pb-2">Course Name</label>
                  <input
                    className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2',
                      '--tw-ring-color': ADMIN_PRIMARY
                    }}
                    placeholder="e.g., Beginner's Pottery"
                    value={formData.classType}
                    onChange={(e) => setFormData({...formData, classType: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium pb-2">Instructor</label>
                  <input
                    className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2'
                    }}
                    placeholder="e.g., Jane Doe"
                    value={formData.instructor}
                    onChange={(e) => setFormData({...formData, instructor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium pb-2">Course Description</label>
                  <textarea
                    className="form-textarea w-full rounded-lg focus:outline-0 focus:ring-2 border placeholder:text-gray-400 p-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2'
                    }}
                    placeholder="Describe the course..."
                    rows="5"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium pb-2">Room</label>
                  <input
                    className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2'
                    }}
                    placeholder="e.g., Studio A"
                    value={formData.room}
                    onChange={(e) => setFormData({...formData, room: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium pb-2">Capacity</label>
                  <input
                    className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2'
                    }}
                    placeholder="e.g., 15"
                    type="number"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData({...formData, maxCapacity: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium pb-2">Date</label>
                  <input
                    className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                    style={{
                      backgroundColor: '#211911',
                      borderColor: '#4A4441',
                      color: '#F8F5F2',
                      colorScheme: 'dark'
                    }}
                    type="date"
                    value={formData.classDate}
                    onChange={(e) => setFormData({...formData, classDate: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium pb-2">Start Time</label>
                    <input
                      className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                      style={{
                        backgroundColor: '#211911',
                        borderColor: '#4A4441',
                        color: '#F8F5F2',
                        colorScheme: 'dark'
                      }}
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium pb-2">End Time</label>
                    <input
                      className="form-input w-full rounded-lg focus:outline-0 focus:ring-2 border h-12 placeholder:text-gray-400 px-4 text-base"
                      style={{
                        backgroundColor: '#211911',
                        borderColor: '#4A4441',
                        color: '#F8F5F2',
                        colorScheme: 'dark'
                      }}
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 flex justify-end gap-4">
              <button
                onClick={handleDelete}
                className="flex items-center justify-center rounded-lg h-12 px-6 text-sm font-bold text-red-500 border border-red-500 hover:bg-red-900/20"
              >
                <span className="truncate">Delete Course</span>
              </button>
              <button
                onClick={handleSave}
                className="flex items-center justify-center rounded-lg h-12 px-8 text-white text-sm font-bold"
                style={{ backgroundColor: ADMIN_PRIMARY }}
              >
                <span className="truncate">Save Changes</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Select a course to edit</p>
          </div>
        )}
      </main>
    </div>
  );
}
