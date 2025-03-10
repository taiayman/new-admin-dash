import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, onSnapshot, 
         addDoc, updateDoc, deleteDoc, doc, orderBy, limit, Timestamp, 
         serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC8atGBEd83BlG2a4_V5utVYuS1PczpQKw",
    authDomain: "ebook-zakaria.firebaseapp.com",
    projectId: "ebook-zakaria",
    storageBucket: "ebook-zakaria.appspot.com",
    messagingSenderId: "311947320356",
    appId: "1:311947320356:android:b47bd9a43f7531d5ee8cb1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Initialize Firebase Functions
const functions = getFunctions(app);
const sendNotification = httpsCallable(functions, 'sendNotification');

// Cloudinary Configuration
const cloudinaryConfig = {
    cloudName: 'dydhel38x',
    uploadPreset: 'ml_default',
    folder: 'ebooks',
    secure: true,
    resourceType: 'auto'
};

// Collection References
const usersRef = collection(db, 'users');
const booksRef = collection(db, 'books');
const genresRef = collection(db, 'academic_genres');
const notificationsRef = collection(db, 'notifications');
const getReadingStatesRef = (userId) => {
    if (!userId) return null;
    try {
        return collection(db, 'readingStates', userId, 'books');
    } catch (error) {
        console.error('Error creating reading states reference:', error);
        return null;
    }
};
const subscriptionPlansRef = collection(db, 'subscriptionPlans');
const subscriptionsRef = collection(db, 'subscriptions');

// Utility Functions
const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

// Dashboard Manager Class
class DashboardManager {
    constructor() {
        this.charts = {};
        this.currentTab = 'users';
        this.currentSubscriberUserId = null;
        this.currentPage = null;
        this.currentUploadType = null;
        this.setupEventListeners();
        this.initializeCharts();
        this.loadDashboardData();
        this.setupRealtimeListeners();
        this.initializeCloudinaryWidget();
    }

    // Utility function to safely update element content
    safelyUpdateElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        } else {
            console.warn(`Element with ID '${elementId}' not found. Skipping update.`);
        }
    }

    async loadDashboardData() {
        await Promise.all([
            this.loadStats(),
            this.loadUsers(),
            this.loadBooks(),
            this.loadGenres(),
            this.loadReadingStates(),
            this.loadSubscriptionPlans(),
            this.loadSubscribers(),
            this.loadNotifications(),
            this.loadNotificationTokens(),
            this.updateCharts()
        ]);
    }

    async loadStats() {
        try {
            // Get current month's data
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            
            // Total Users
            const totalUsers = (await getDocs(usersRef)).size;
            this.safelyUpdateElement('total-users', totalUsers);

            // Total Books
            const totalBooks = (await getDocs(booksRef)).size;
            this.safelyUpdateElement('total-books', totalBooks);

            // Active Readers (count users who have read in the current month)
            let activeReadersCount = 0;
            const usersSnapshot = await getDocs(usersRef);
            
            for (const userDoc of usersSnapshot.docs) {
                const userReadingStatesRef = getReadingStatesRef(userDoc.id);
                if (userReadingStatesRef) {
                    const recentReads = await getDocs(query(
                        userReadingStatesRef,
                        where('lastReadAt', '>=', Timestamp.fromDate(monthStart)),
                        limit(1)
                    ));
                    if (!recentReads.empty) {
                        activeReadersCount++;
                    }
                }
            }
            this.safelyUpdateElement('active-readers', activeReadersCount);

            // Premium Users
            const premiumUsers = (await getDocs(query(
                usersRef,
                where('isPremium', '==', true)
            ))).size;
            this.safelyUpdateElement('premium-users', premiumUsers);

            // Active Subscriptions
            const activeSubscriptions = (await getDocs(query(
                usersRef,
                where('subscription.status', '==', 'active')
            ))).size;
            this.safelyUpdateElement('active-subscriptions', activeSubscriptions);

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadUsers() {
        try {
            const snapshot = await getDocs(query(usersRef));
            const tbody = document.getElementById('users-table');
            tbody.innerHTML = '';

            snapshot.forEach(doc => {
                const user = doc.data();
                const displayName = user.full_name || user.name || user.displayName || 'N/A';
                const email = user.email || 'N/A';
                let status = user.onboarding_step === 'onboarding_completed' ? 'active' : 
                             user.onboarding_step || user.status || 'pending';
                
                // Check if user account is disabled
                if (user.isDisabled === true) {
                    status = 'blocked';
                }

                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3">
                            <div class="flex flex-col">
                                <span class="font-medium">${displayName}</span>
                                <span class="text-xs text-gray-500 md:hidden">${email}</span>
                            </div>
                        </td>
                        <td class="py-3 hidden md:table-cell">${email}</td>
                        <td class="py-3">
                            <span class="px-2 py-1 text-xs md:text-sm rounded-full ${
                                status === 'active' || status === 'onboarding_completed' ? 'bg-green-100 text-green-800' :
                                status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                                status === 'blocked' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                            }">
                                ${status === 'onboarding_completed' ? 'active' : status}
                            </span>
                        </td>
                        <td class="py-3 text-right">
                            <div class="flex justify-end space-x-1">
                                <button onclick="dashboardManager.viewUser('${doc.id}')" 
                                        class="p-1 md:p-2 text-blue-600 hover:bg-blue-100 rounded-full">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="dashboardManager.editUser('${doc.id}')" 
                                        class="p-1 md:p-2 text-yellow-600 hover:bg-yellow-100 rounded-full">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="dashboardManager.toggleUserStatus('${doc.id}', ${user.isDisabled === true})" 
                                        class="px-2 py-1 md:px-3 md:py-2 rounded ${user.isDisabled ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} flex items-center">
                                    <i class="fas ${user.isDisabled ? 'fa-unlock' : 'fa-ban'} mr-1"></i>
                                    <span class="text-xs md:text-sm">${user.isDisabled ? 'Unblock' : 'Block'}</span>
                                </button>
                                <button onclick="dashboardManager.deleteUser('${doc.id}')" 
                                        class="p-1 md:p-2 text-red-600 hover:bg-red-100 rounded-full">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            console.log(`Loaded ${snapshot.size} users`);
        } catch (error) {
            console.error('Error loading users:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-4 text-center text-red-600">
                        Error loading users: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadBooks() {
        try {
            const snapshot = await getDocs(query(booksRef, orderBy('title')));
            const tbody = document.getElementById('books-table');
            tbody.innerHTML = '';

            snapshot.forEach(doc => {
                const book = doc.data();
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3">${book.title || 'N/A'}</td>
                        <td class="py-3">${book.author || 'N/A'}</td>
                        <td class="py-3">
                            <div class="flex flex-wrap gap-1">
                                ${book.genres?.map(genre => 
                                    `<span class="inline-block px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                                        ${genre}
                                    </span>`
                                ).join('') || 'N/A'}
                            </div>
                        </td>
                        <td class="py-3 text-right">
                            <div class="flex justify-end space-x-2">
                                <button onclick="dashboardManager.viewBook('${doc.id}')" 
                                        class="text-blue-600 hover:text-blue-800 px-2">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="dashboardManager.editBook('${doc.id}')" 
                                        class="text-green-600 hover:text-green-800 px-2">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="dashboardManager.deleteBook('${doc.id}')" 
                                        class="text-red-600 hover:text-red-800 px-2">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            console.log(`Loaded ${snapshot.size} books`);
        } catch (error) {
            console.error('Error loading books:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-4 text-center text-red-600">
                        Error loading books: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadGenres() {
        try {
            const snapshot = await getDocs(query(genresRef, orderBy('name')));
            const tbody = document.getElementById('genres-table');
            tbody.innerHTML = '';

            snapshot.forEach(doc => {
                const genre = doc.data();
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3 px-4 whitespace-normal">${genre.name || 'N/A'}</td>
                        <td class="py-3 px-4 whitespace-normal">
                            <div class="max-w-xs lg:max-w-md truncate">
                                ${genre.description || 'N/A'}
                            </div>
                        </td>
                        <td class="py-3 px-4">
                            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                ${genre.bookCount || 0} books
                            </span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <div class="flex justify-end items-center space-x-3">
                                <button onclick="dashboardManager.viewGenre('${doc.id}')" 
                                        class="text-blue-600 hover:text-blue-800 transition-colors duration-200">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="dashboardManager.editGenre('${doc.id}')" 
                                        class="text-green-600 hover:text-green-800 transition-colors duration-200">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="dashboardManager.deleteGenre('${doc.id}')" 
                                        class="text-red-600 hover:text-red-800 transition-colors duration-200">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            console.log(`Loaded ${snapshot.size} genres`);
        } catch (error) {
            console.error('Error loading genres:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-4 text-center text-red-600">
                        Error loading genres: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadReadingStates() {
        try {
            // First, get all users
            const usersSnapshot = await getDocs(usersRef);
            const readingStates = [];

            console.log(`Found ${usersSnapshot.docs.length} users to check for reading states`);

            // For each user, get their reading states
            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const userReadingStatesRef = getReadingStatesRef(userId);
                
                if (!userReadingStatesRef) {
                    console.log(`No reading states reference for user: ${userId}`);
                    continue;
                }
                
                try {
                    const userReadingStatesSnapshot = await getDocs(query(
                        userReadingStatesRef,
                        orderBy('lastReadAt', 'desc'),
                        limit(5) // Limit per user to avoid too many reads
                    ));

                    console.log(`Found ${userReadingStatesSnapshot.docs.length} reading states for user ${userId}`);

                    // Add each reading state with user info
                    for (const stateDoc of userReadingStatesSnapshot.docs) {
                        const stateData = stateDoc.data();
                        console.log(`Reading state data for ${stateDoc.id}:`, stateData);
                        
                        // Use document ID as bookId if missing
                        const bookId = stateData.bookId || stateDoc.id;
                        
                        // Skip if missing lastReadAt
                        if (!stateData.lastReadAt) {
                            console.log(`Skipping reading state with missing lastReadAt: ${stateDoc.id}`);
                            continue;
                        }
                        
                        // Normalize progress value
                        let progress = stateData.progress;
                        if (progress === undefined) {
                            // Try to use readingProgress if progress is missing
                            progress = stateData.readingProgress;
                            if (progress === undefined) {
                                // Default to 0 if no progress information is available
                                progress = 0;
                            }
                        }
                        
                        readingStates.push({
                            id: stateDoc.id,
                            userId: userId,
                            userData: userDoc.data(),
                            bookId: bookId,
                            progress: progress,
                            lastReadAt: stateData.lastReadAt,
                            currentPage: stateData.currentPage || 0,
                            isReading: stateData.isReading || false,
                            ...stateData
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching reading states for user ${userId}:`, error);
                }
            }

            // Sort all reading states by lastReadAt
            readingStates.sort((a, b) => {
                // Handle different timestamp formats (Firestore Timestamp or string date)
                const dateA = a.lastReadAt?.toDate ? a.lastReadAt.toDate() : 
                             (a.lastReadAt ? new Date(a.lastReadAt) : new Date(0));
                const dateB = b.lastReadAt?.toDate ? b.lastReadAt.toDate() : 
                             (b.lastReadAt ? new Date(b.lastReadAt) : new Date(0));
                return dateB - dateA;
            });

            // Take only the most recent 20 states
            const recentStates = readingStates.slice(0, 20);
            console.log(`Total reading states after processing: ${recentStates.length}`);

            const tbody = document.getElementById('reading-table');
            tbody.innerHTML = '';

            if (recentStates.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-4 text-center text-gray-600">
                            No reading states found
                        </td>
                    </tr>
                `;
                return;
            }

            for (const state of recentStates) {
                try {
                    // Get book data
                    const bookQuery = query(booksRef, where('id', '==', state.bookId));
                    const bookSnapshot = await getDocs(bookQuery);
                    const bookData = bookSnapshot.docs[0]?.data() || { title: `(ID: ${state.bookId})` };

                    // Format the date
                    const lastReadDate = state.lastReadAt ? 
                        (state.lastReadAt.toDate ? state.lastReadAt.toDate() : new Date(state.lastReadAt))
                        : new Date();
                    const formattedDate = lastReadDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });

                    // Calculate progress
                    const progress = state.progress || 0;
                    const progressPercentage = typeof progress === 'number' ? 
                        Math.min(100, Math.max(0, progress * 100)) : // Convert 0-1 to percentage and clamp
                        (parseFloat(progress) || 0);

                    // Get user name from userData we already have
                    const userName = state.userData.full_name || 
                                   state.userData.name || 
                                   state.userData.displayName || 
                                   state.userData.email ||
                                   'Unknown User';

                    tbody.innerHTML += `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="py-3">
                                <div class="flex flex-col">
                                    <span class="font-medium">${userName}</span>
                                    <span class="text-xs text-gray-500 md:hidden">${formattedDate}</span>
                                </div>
                            </td>
                            <td class="py-3">
                                <div class="flex flex-col">
                                    <span>${bookData.title}</span>
                                    <span class="text-xs text-gray-500 md:hidden">ID: ${state.bookId}</span>
                                </div>
                            </td>
                            <td class="py-3">
                                <div class="flex items-center">
                                    <div class="w-16 md:w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div class="h-full bg-blue-500" style="width: ${progressPercentage}%"></div>
                                    </div>
                                    <span class="ml-2 text-xs md:text-sm text-gray-600">${progressPercentage.toFixed(1)}%</span>
                                </div>
                                <div class="text-xs text-gray-500 mt-1 hidden md:block">Last read: ${formattedDate}</div>
                            </td>
                            <td class="py-3 text-right">
                                <div class="flex justify-end space-x-1">
                                    <button onclick="dashboardManager.viewReadingState('${state.id}', '${state.userId}')"
                                            class="p-1 md:p-2 text-blue-600 hover:bg-blue-100 rounded-full">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button onclick="dashboardManager.editReadingState('${state.id}', '${state.userId}')"
                                            class="p-1 md:p-2 text-yellow-600 hover:bg-yellow-100 rounded-full">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="dashboardManager.deleteReadingState('${state.id}', '${state.userId}')"
                                            class="p-1 md:p-2 text-red-600 hover:bg-red-100 rounded-full">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                } catch (error) {
                    console.error('Error processing reading state:', error);
                }
            }

            console.log(`Loaded ${recentStates.length} reading states`);
        } catch (error) {
            console.error('Error loading reading states:', error);
            const tbody = document.getElementById('reading-table');
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-4 text-center text-red-600">
                        Error loading reading states: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadSubscriptionPlans() {
        try {
            const snapshot = await getDocs(query(subscriptionPlansRef, orderBy('price')));
            const tbody = document.getElementById('subscription-plans-table');
            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-4 text-center text-gray-600">
                            No subscription plans found
                        </td>
                    </tr>
                `;
                return;
            }

            snapshot.forEach(doc => {
                const plan = doc.data();
                const features = Array.isArray(plan.features) ? 
                    plan.features.join(', ') : 
                    (typeof plan.features === 'string' ? plan.features : '');
                
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3">${plan.name || 'N/A'}</td>
                        <td class="py-3">$${(plan.price || 0).toFixed(2)}</td>
                        <td class="py-3">${plan.duration || 0} ${plan.durationType || 'month'}(s)</td>
                        <td class="py-3 max-w-xs truncate">${features || 'N/A'}</td>
                        <td class="py-3">
                            <span class="px-2 py-1 text-sm rounded-full ${
                                plan.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }">
                                ${plan.active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="py-3 text-right">
                            <div class="flex justify-end space-x-2">
                                <button onclick="dashboardManager.viewSubscriptionPlan('${doc.id}')" 
                                        class="text-blue-600 hover:text-blue-800 px-2">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="dashboardManager.editSubscriptionPlan('${doc.id}')" 
                                        class="text-green-600 hover:text-green-800 px-2">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="dashboardManager.deleteSubscriptionPlan('${doc.id}')" 
                                        class="text-red-600 hover:text-red-800 px-2">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            console.log(`Loaded ${snapshot.size} subscription plans`);
        } catch (error) {
            console.error('Error loading subscription plans:', error);
            const tbody = document.getElementById('subscription-plans-table');
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-4 text-center text-red-600">
                        Error loading subscription plans: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadSubscribers() {
        try {
            // Get users with subscription data
            const snapshot = await getDocs(query(
                usersRef, 
                where('subscription.status', 'in', ['active', 'cancelled', 'pending']),
                orderBy('subscription.startDate', 'desc')
            ));
            
            const tbody = document.getElementById('subscribers-table');
            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-4 text-center text-gray-600">
                            No subscribers found
                        </td>
                    </tr>
                `;
                return;
            }

            // Count active subscriptions for stats
            let activeSubscriptionsCount = 0;

            snapshot.forEach(doc => {
                const user = doc.data();
                const subscription = user.subscription || {};
                
                // Count active subscriptions
                if (subscription.status === 'active') {
                    activeSubscriptionsCount++;
                }
                
                // Format dates
                const startDate = subscription.startDate ? 
                    (subscription.startDate.toDate ? subscription.startDate.toDate() : new Date(subscription.startDate)) 
                    : null;
                const endDate = subscription.endDate ? 
                    (subscription.endDate.toDate ? subscription.endDate.toDate() : new Date(subscription.endDate)) 
                    : null;
                
                const formattedStartDate = startDate ? startDate.toLocaleDateString() : 'N/A';
                const formattedEndDate = endDate ? endDate.toLocaleDateString() : 'N/A';
                
                // Get user name from various possible fields
                const userName = user.full_name || user.name || user.displayName || user.email || 'Unknown User';
                
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3">${userName}</td>
                        <td class="py-3">${subscription.plan || 'N/A'}</td>
                        <td class="py-3">${formattedStartDate}</td>
                        <td class="py-3">${formattedEndDate}</td>
                        <td class="py-3">
                            <span class="px-2 py-1 text-sm rounded-full ${
                                subscription.status === 'active' ? 'bg-green-100 text-green-800' : 
                                subscription.status === 'cancelled' ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-gray-100 text-gray-800'
                            }">
                                ${subscription.status || 'inactive'}
                            </span>
                        </td>
                        <td class="py-3 text-right">
                            <div class="flex justify-end space-x-2">
                                <button onclick="dashboardManager.viewSubscriber('${doc.id}')" 
                                        class="text-blue-600 hover:text-blue-800 px-2">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="dashboardManager.editSubscriber('${doc.id}')" 
                                        class="text-green-600 hover:text-green-800 px-2">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="dashboardManager.cancelSubscription('${doc.id}')" 
                                        class="text-red-600 hover:text-red-800 px-2">
                                    <i class="fas fa-ban"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            // Update active subscriptions count in stats
            const activeSubscriptionsElement = document.getElementById('active-subscriptions');
            if (activeSubscriptionsElement) {
                activeSubscriptionsElement.textContent = activeSubscriptionsCount;
            }

            console.log(`Loaded ${snapshot.size} subscribers`);
        } catch (error) {
            console.error('Error loading subscribers:', error);
            const tbody = document.getElementById('subscribers-table');
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-4 text-center text-red-600">
                        Error loading subscribers: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    initializeCharts() {
        // User Activity Chart
        const userActivityCtx = document.getElementById('user-activity-chart')?.getContext('2d');
        if (userActivityCtx) {
            this.charts.userActivity = new Chart(userActivityCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Active Users',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // Genres Chart
        const genresCtx = document.getElementById('genres-chart')?.getContext('2d');
        if (genresCtx) {
            this.charts.genres = new Chart(genresCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#3b82f6',
                            '#10b981',
                            '#f59e0b',
                            '#ef4444',
                            '#8b5cf6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }

    async updateCharts() {
        await Promise.all([
            this.updateUserActivityChart(),
            this.updateGenresChart()
        ]);
    }

    async updateUserActivityChart() {
        try {
            const days = 7;
            const data = new Array(days).fill(0);
            const labels = [];
            const usersSnapshot = await getDocs(usersRef);
            
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                
                const startOfDay = new Date(date.setHours(0, 0, 0, 0));
                const endOfDay = new Date(date.setHours(23, 59, 59, 999));
                
                let dailyActiveUsers = 0;
                
                // Check each user's reading activity for the day
                for (const userDoc of usersSnapshot.docs) {
                    const userReadingStatesRef = getReadingStatesRef(userDoc.id);
                    if (userReadingStatesRef) {
                        const userReads = await getDocs(query(
                            userReadingStatesRef,
                            where('lastReadAt', '>=', Timestamp.fromDate(startOfDay)),
                            where('lastReadAt', '<=', Timestamp.fromDate(endOfDay)),
                            limit(1)
                        ));
                        if (!userReads.empty) {
                            dailyActiveUsers++;
                        }
                    }
                }
                
                data[days - 1 - i] = dailyActiveUsers;
            }

            if (this.charts.userActivity) {
                this.charts.userActivity.data.labels = labels;
                this.charts.userActivity.data.datasets[0].data = data;
                this.charts.userActivity.update();
            }
        } catch (error) {
            console.error('Error updating user activity chart:', error);
        }
    }

    async updateGenresChart() {
        try {
            const genreCounts = {};
            const snapshot = await getDocs(booksRef);
            
            snapshot.forEach(doc => {
                const book = doc.data();
                if (book.genres && Array.isArray(book.genres)) {
                    book.genres.forEach(genre => {
                        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                    });
                }
            });

            const sortedGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (this.charts.genres) {
                this.charts.genres.data.labels = sortedGenres.map(([genre]) => genre);
                this.charts.genres.data.datasets[0].data = sortedGenres.map(([, count]) => count);
                this.charts.genres.update();
            }
        } catch (error) {
            console.error('Error updating genres chart:', error);
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = tab.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            this.filterContent(searchTerm);
        });

        // Tab switching
        window.handleTabSwitch = (clickedTab, tabName) => {
            // Remove active class from all tabs
            document.querySelectorAll('[data-tab]').forEach(tab => {
                tab.classList.remove('active-tab', 'text-white');
                tab.classList.add('hover:bg-gray-100');
            });

            // Add active class to clicked tab
            clickedTab.classList.add('active-tab', 'text-white');
            clickedTab.classList.remove('hover:bg-gray-100');

            // Hide all content sections
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });

            // Show selected content
            document.getElementById(`${tabName}-content`).classList.remove('hidden');

            // Update current tab
            this.currentTab = tabName;

            // Reapply current search filter
            const searchTerm = document.getElementById('search-input').value.toLowerCase();
            this.filterContent(searchTerm);
        };

        // Reading tab buttons
        document.getElementById('refreshReadingBtn')?.addEventListener('click', () => this.loadReadingStates());
        document.getElementById('fixReadingBtn')?.addEventListener('click', () => this.fixReadingStates());

        // Notification type change event
        document.getElementById('notification-type').addEventListener('change', (e) => {
            const type = e.target.value;
            const topicSelection = document.getElementById('topic-selection');
            const userSelection = document.getElementById('user-selection');
            
            topicSelection.classList.add('hidden');
            userSelection.classList.add('hidden');
            
            if (type === 'topic') {
                topicSelection.classList.remove('hidden');
            } else if (type === 'specific') {
                userSelection.classList.remove('hidden');
                this.populateUserDropdown();
            }
        });
        
        // Notification form submission
        document.getElementById('notification-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendNotification();
        });
    }

    filterContent(searchTerm) {
        const tables = {
            users: document.getElementById('users-table'),
            books: document.getElementById('books-table'),
            genres: document.getElementById('genres-table'),
            reading: document.getElementById('reading-table'),
            subscriptions: document.getElementById('subscription-plans-table')
        };

        const currentTable = tables[this.currentTab];
        if (!currentTable) return;

        const rows = currentTable.getElementsByTagName('tr');
        for (const row of rows) {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        }
    }

    setupRealtimeListeners() {
        // Setup realtime listeners for each collection
        onSnapshot(query(usersRef, orderBy('name')), () => this.loadUsers());
        onSnapshot(query(booksRef, orderBy('title')), () => this.loadBooks());
        onSnapshot(query(genresRef, orderBy('name')), () => this.loadGenres());
        onSnapshot(query(subscriptionPlansRef, orderBy('price')), () => this.loadSubscriptionPlans());
    }

    // CRUD Operations for Users
    async viewUser(userId) {
        try {
            const userDoc = await getDoc(doc(usersRef, userId));
            if (userDoc.exists()) {
                const user = userDoc.data();
                const displayName = user.full_name || user.name || user.displayName || 'N/A';
                const status = user.onboarding_step === 'onboarding_completed' ? 'active' : 
                             user.onboarding_step || user.status || 'pending';
                
                // Check if user has subscription data
                const subscription = user.subscription || {};
                const subscriptionStatus = subscription.status || 'none';
                
                const details = [
                    `Name: ${displayName}`,
                    `Email: ${user.email || 'N/A'}`,
                    `Status: ${status}`,
                    `Premium: ${user.isPremium ? 'Yes' : 'No'}`,
                    `Subscription: ${subscriptionStatus}`,
                    `Join Date: ${user.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString() : 'N/A'}`,
                    `Last Active: ${user.last_active ? new Date(user.last_active).toLocaleString() : 'N/A'}`
                ].join('\n');

                alert(`User Details:\n${details}`);
            } else {
                alert('User not found');
            }
        } catch (error) {
            console.error('Error viewing user:', error);
            alert('Error viewing user details');
        }
    }

    async editUser(userId) {
        try {
            const userDoc = await getDoc(doc(usersRef, userId));
            if (userDoc.exists()) {
                const user = userDoc.data();
                // In a real application, you would show this in a modal with a form
                const newName = prompt('Enter new name:', user.name);
                if (newName && newName !== user.name) {
                    await updateDoc(doc(usersRef, userId), {
                        name: newName,
                        updatedAt: serverTimestamp()
                    });
                    this.loadUsers();
                }
            } else {
                alert('User not found');
            }
        } catch (error) {
            console.error('Error editing user:', error);
            alert('Error editing user');
        }
    }

    async deleteUser(userId) {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await deleteDoc(doc(usersRef, userId));
                this.loadStats();
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Error deleting user');
            }
        }
    }

    async toggleUserStatus(userId, isCurrentlyDisabled) {
        try {
            const action = isCurrentlyDisabled ? 'enable' : 'disable';
            const message = isCurrentlyDisabled ? 
                'Are you sure you want to enable this account? The user will be able to log in again.' : 
                'Are you sure you want to disable this account? The user will not be able to log in and will see a message to contact support.';
                
            if (confirm(message)) {
                await updateDoc(doc(usersRef, userId), {
                    isDisabled: !isCurrentlyDisabled,
                    updatedAt: serverTimestamp()
                });
                
                alert(`User account ${action}d successfully`);
                this.loadUsers();
            }
        } catch (error) {
            console.error('Error toggling user status:', error);
            alert('Error toggling user status');
        }
    }

    // CRUD Operations for Books
    async viewBook(bookId) {
        try {
            const bookDoc = await getDoc(doc(booksRef, bookId));
            if (bookDoc.exists()) {
                const book = bookDoc.data();
                const details = [
                    `Title: ${book.title || 'N/A'}`,
                    `Author: ${book.author || 'N/A'}`,
                    `Genres: ${book.genres?.join(', ') || 'N/A'}`,
                    `Description: ${book.description || 'N/A'}`,
                    `Published: ${book.publishedDate ? new Date(book.publishedDate).toLocaleDateString() : 'N/A'}`,
                    `ISBN: ${book.isbn || 'N/A'}`
                ].join('\n');

                alert(`Book Details:\n${details}`);
            } else {
                alert('Book not found');
            }
        } catch (error) {
            console.error('Error viewing book:', error);
            alert('Error viewing book details');
        }
    }

    async addBook() {
        try {
            // Set the modal title and mode
            document.getElementById('book-modal-title').textContent = 'Add New Book';
            document.getElementById('edit-book-mode').value = 'add';
            document.getElementById('edit-book-id').value = '';
            
            // Clear form
            document.getElementById('edit-book-form').reset();
            
            // Set default values for new book
            document.getElementById('edit-book-language').value = 'en';
            document.getElementById('edit-book-rating').value = '0';
            
            // Clear audio files container
            document.getElementById('audio-files-container').innerHTML = '';
            
            // Clear genre selections
            const genresSelect = document.getElementById('edit-book-genres');
            Array.from(genresSelect.options).forEach(option => {
                option.selected = false;
            });
            
            // Show the modal
            const modal = document.getElementById('edit-book-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            // Setup form submission
            this.setupBookFormSubmission();
        } catch (error) {
            console.error('Error preparing add book form:', error);
            alert('Error preparing add book form: ' + error.message);
        }
    }

    async editBook(bookId) {
        try {
            const bookDoc = await getDoc(doc(booksRef, bookId));
            if (bookDoc.exists()) {
                // Set the modal title and mode
                document.getElementById('book-modal-title').textContent = 'Edit Book';
                document.getElementById('edit-book-mode').value = 'edit';
                document.getElementById('edit-book-id').value = bookId;
                
                const book = bookDoc.data();
                
                // Fill the form with current book data
                document.getElementById('edit-book-title').value = book.title || '';
                document.getElementById('edit-book-author').value = book.author || '';
                document.getElementById('edit-book-description').value = book.description || '';
                document.getElementById('edit-book-cover-url').value = book.coverUrl || '';
                document.getElementById('edit-book-image-url').value = book.imageUrl || '';
                document.getElementById('edit-book-pdf-url').value = book.pdfUrl || '';
                document.getElementById('edit-book-publisher').value = book.publisher || '';
                document.getElementById('edit-book-language').value = book.language || 'en';
                document.getElementById('edit-book-page-count').value = book.pageCount || 0;
                document.getElementById('edit-book-rating').value = book.rating || 0;
                document.getElementById('edit-book-release-date').value = book.releaseDate || '';
                document.getElementById('edit-book-is-premium').checked = book.isPremium || false;
                document.getElementById('edit-book-featured').checked = book.featured || false;
                document.getElementById('edit-book-isbn').value = book.isbn || '';
                document.getElementById('edit-book-preview-pages').value = book.previewPages || 0;
                document.getElementById('edit-book-has-audio').checked = book.hasPrerecordedAudio || false;

                // Load existing audio files
                const audioContainer = document.getElementById('audio-files-container');
                audioContainer.innerHTML = '';
                if (book.pageAudioUrls) {
                    Object.entries(book.pageAudioUrls).forEach(([page, url]) => {
                        this.currentPage = page;
                        this.addAudioFileToList(url);
                    });
                }

                // Handle genres
                const genresSelect = document.getElementById('edit-book-genres');
                Array.from(genresSelect.options).forEach(option => {
                    option.selected = book.genres?.includes(option.value) || false;
                });

                // Show the modal
                const modal = document.getElementById('edit-book-modal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');

                // Setup form submission
                this.setupBookFormSubmission(book);
            } else {
                alert('Book not found');
            }
        } catch (error) {
            console.error('Error editing book:', error);
            alert('Error editing book');
        }
    }

    setupBookFormSubmission(existingBook = null) {
        const form = document.getElementById('edit-book-form');
        const mode = document.getElementById('edit-book-mode').value;
        const bookId = document.getElementById('edit-book-id').value;
        
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const bookData = {
                title: document.getElementById('edit-book-title').value,
                author: document.getElementById('edit-book-author').value,
                description: document.getElementById('edit-book-description').value,
                coverUrl: document.getElementById('edit-book-cover-url').value,
                imageUrl: document.getElementById('edit-book-image-url').value,
                pdfUrl: document.getElementById('edit-book-pdf-url').value,
                publisher: document.getElementById('edit-book-publisher').value,
                language: document.getElementById('edit-book-language').value,
                pageCount: parseInt(document.getElementById('edit-book-page-count').value) || 0,
                rating: parseFloat(document.getElementById('edit-book-rating').value) || 0,
                releaseDate: document.getElementById('edit-book-release-date').value,
                isPremium: document.getElementById('edit-book-is-premium').checked,
                featured: document.getElementById('edit-book-featured').checked,
                isbn: document.getElementById('edit-book-isbn').value,
                previewPages: parseInt(document.getElementById('edit-book-preview-pages').value) || 0,
                hasPrerecordedAudio: document.getElementById('edit-book-has-audio').checked,
                pageAudioUrls: this.getAudioFilesMap(),
                genres: Array.from(document.getElementById('edit-book-genres').selectedOptions).map(option => option.value),
                updatedAt: serverTimestamp(),
                estimatedReadingTime: Math.ceil(parseInt(document.getElementById('edit-book-page-count').value) / 20) || 0,
                slug: document.getElementById('edit-book-title').value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '')
            };

            try {
                if (mode === 'add') {
                    // Add new fields specific to new books
                    bookData.createdAt = serverTimestamp();
                    bookData.totalRatings = 0;
                    bookData.readCount = 0;
                    bookData.id = doc(collection(db, '_')).id;
                    
                    // Add the new book to the database
                    await addDoc(booksRef, bookData);
                    alert('Book added successfully!');
                } else {
                    // Keep existing creation date and stats
                    if (existingBook) {
                        bookData.createdAt = existingBook.createdAt || serverTimestamp();
                        bookData.totalRatings = existingBook.totalRatings || 0;
                        bookData.readCount = existingBook.readCount || 0;
                    }
                    
                    // Update the existing book
                    await updateDoc(doc(booksRef, bookId), bookData);
                    alert('Book updated successfully!');
                }
                
                // Hide modal and reset form
                const modal = document.getElementById('edit-book-modal');
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                form.reset();
                
                // Reload books list and stats
                this.loadBooks();
                this.loadStats();
            } catch (error) {
                console.error('Error saving book:', error);
                alert('Error saving book: ' + error.message);
            }
        };
    }

    async deleteBook(bookId) {
        if (confirm('Are you sure you want to delete this book?')) {
            try {
                await deleteDoc(doc(booksRef, bookId));
                this.loadStats();
            } catch (error) {
                console.error('Error deleting book:', error);
                alert('Error deleting book');
            }
        }
    }

    // CRUD Operations for Genres
    async viewGenre(genreId) {
        try {
            const genreDoc = await getDoc(doc(genresRef, genreId));
            if (genreDoc.exists()) {
                const genre = genreDoc.data();
                const details = [
                    `Name: ${genre.name || 'N/A'}`,
                    `Description: ${genre.description || 'N/A'}`,
                    `Book Count: ${genre.bookCount || 0} books`,
                    `Featured: ${genre.featured ? 'Yes' : 'No'}`,
                    `Icon URL: ${genre.iconUrl || 'N/A'}`
                ].join('\n');

                alert(`Genre Details:\n${details}`);
            } else {
                alert('Genre not found');
            }
        } catch (error) {
            console.error('Error viewing genre:', error);
            alert('Error viewing genre details');
        }
    }

    async addGenre() {
        try {
            // Set the modal title and mode
            document.getElementById('genre-modal-title').textContent = 'Add New Genre';
            document.getElementById('edit-genre-mode').value = 'add';
            document.getElementById('edit-genre-id').value = '';
            
            // Clear form
            document.getElementById('edit-genre-form').reset();
            
            // Show the modal
            const modal = document.getElementById('edit-genre-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            // Setup form submission
            this.setupGenreFormSubmission();
        } catch (error) {
            console.error('Error preparing add genre form:', error);
            alert('Error preparing add genre form: ' + error.message);
        }
    }

    async editGenre(genreId) {
        try {
            const genreDoc = await getDoc(doc(genresRef, genreId));
            if (genreDoc.exists()) {
                // Set the modal title and mode
                document.getElementById('genre-modal-title').textContent = 'Edit Genre';
                document.getElementById('edit-genre-mode').value = 'edit';
                
                const genre = genreDoc.data();
                
                // Fill the form with current genre data
                document.getElementById('edit-genre-id').value = genreId;
                document.getElementById('edit-genre-name').value = genre.name || '';
                document.getElementById('edit-genre-description').value = genre.description || '';
                document.getElementById('edit-genre-icon-url').value = genre.iconUrl || '';
                document.getElementById('edit-genre-featured').checked = genre.featured || false;

                // Show the modal
                const modal = document.getElementById('edit-genre-modal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');

                // Setup form submission
                this.setupGenreFormSubmission(genre);
            } else {
                alert('Genre not found');
            }
        } catch (error) {
            console.error('Error editing genre:', error);
            alert('Error editing genre');
        }
    }

    setupGenreFormSubmission(existingGenre = null) {
        const form = document.getElementById('edit-genre-form');
        const mode = document.getElementById('edit-genre-mode').value;
        const genreId = document.getElementById('edit-genre-id').value;
        
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const genreData = {
                // Basic Info
                name: document.getElementById('edit-genre-name').value,
                description: document.getElementById('edit-genre-description').value,
                iconUrl: document.getElementById('edit-genre-icon-url').value || '',
                
                // Status
                featured: document.getElementById('edit-genre-featured').checked,
                
                // Metadata
                updatedAt: serverTimestamp(),
                
                // SEO and Display
                slug: document.getElementById('edit-genre-name').value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '')
            };

            try {
                if (mode === 'add') {
                    // Add new fields specific to new genres
                    genreData.createdAt = serverTimestamp();
                    genreData.bookCount = 0;
                    
                    // Add the new genre to the database
                    await addDoc(genresRef, genreData);
                    alert('Genre added successfully!');
                } else {
                    // Keep existing creation date and book count
                    if (existingGenre) {
                        genreData.createdAt = existingGenre.createdAt || serverTimestamp();
                        genreData.bookCount = existingGenre.bookCount || 0;
                    }
                    
                    // Update the existing genre
                    await updateDoc(doc(genresRef, genreId), genreData);
                    alert('Genre updated successfully!');
                }
                
                // Hide modal and reset form
                const modal = document.getElementById('edit-genre-modal');
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                form.reset();
                
                // Reload genres list and stats
                this.loadGenres();
                this.updateGenresChart();
            } catch (error) {
                console.error('Error saving genre:', error);
                alert('Error saving genre: ' + error.message);
            }
        };
    }

    async deleteGenre(genreId) {
        if (confirm('Are you sure you want to delete this genre?')) {
            try {
                await deleteDoc(doc(genresRef, genreId));
                this.loadStats();
            } catch (error) {
                console.error('Error deleting genre:', error);
                alert('Error deleting genre');
            }
        }
    }

    // Reading State Management
    async viewReadingState(stateId, userId) {
        try {
            const stateDoc = await getDoc(doc(getReadingStatesRef(userId), stateId));
            
            if (stateDoc.exists()) {
                const stateData = stateDoc.data();
                
                // Use document ID as bookId if missing
                const bookId = stateData.bookId || stateDoc.id;
                
                // Get book data
                let bookTitle = `(ID: ${bookId})`;
                try {
                    const bookQuery = query(booksRef, where('id', '==', bookId));
                    const bookSnapshot = await getDocs(bookQuery);
                    if (bookSnapshot.docs.length > 0) {
                        bookTitle = bookSnapshot.docs[0].data().title;
                    }
                } catch (error) {
                    console.error('Error fetching book details:', error);
                }
                
                // Get user data
                let userName = 'Unknown User';
                try {
                    const userDoc = await getDoc(doc(usersRef, userId));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        userName = userData.full_name || userData.name || userData.displayName || userData.email || 'Unknown User';
                    }
                } catch (error) {
                    console.error('Error fetching user details:', error);
                }
                
                // Format the date
                const lastReadDate = stateData.lastReadAt ? 
                    (stateData.lastReadAt.toDate ? stateData.lastReadAt.toDate() : new Date(stateData.lastReadAt))
                    : new Date();
                const formattedDate = lastReadDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                // Calculate progress percentage
                let progress = stateData.progress;
                if (progress === undefined) {
                    // Try to use readingProgress if progress is missing
                    progress = stateData.readingProgress;
                    if (progress === undefined) {
                        // Default to 0 if no progress information is available
                        progress = 0;
                    }
                }
                
                const progressPercentage = typeof progress === 'number' ? 
                    Math.min(100, Math.max(0, progress * 100)) : // Convert 0-1 to percentage and clamp
                    (parseFloat(progress) || 0);
                
                // Format current page
                const currentPage = stateData.currentPage || 'N/A';
                
                // Format additional details
                const details = `
User: ${userName}
Book: ${bookTitle}
Progress: ${progressPercentage.toFixed(1)}%
Current Page: ${currentPage}
Last Read: ${formattedDate}
Book ID: ${bookId}
Reading State ID: ${stateId}
Document Data: ${JSON.stringify(stateData, null, 2)}
                `;
                
                alert(`Reading State Details:\n${details}`);
            } else {
                alert('Reading state not found');
            }
        } catch (error) {
            console.error('Error viewing reading state:', error);
            alert('Error viewing reading state details');
        }
    }

    async editReadingState(stateId, userId) {
        try {
            const stateDoc = await getDoc(doc(getReadingStatesRef(userId), stateId));
            
            if (stateDoc.exists()) {
                const stateData = stateDoc.data();
                
                // Use document ID as bookId if missing
                const bookId = stateData.bookId || stateDoc.id;
                
                // Get book data for reference
                let bookTitle = `(ID: ${bookId})`;
                try {
                    const bookQuery = query(booksRef, where('id', '==', bookId));
                    const bookSnapshot = await getDocs(bookQuery);
                    if (bookSnapshot.docs.length > 0) {
                        bookTitle = bookSnapshot.docs[0].data().title;
                    }
                } catch (error) {
                    console.error('Error fetching book details:', error);
                }
                
                // Calculate current progress percentage
                let currentProgress = stateData.progress;
                if (currentProgress === undefined) {
                    // Try to use readingProgress if progress is missing
                    currentProgress = stateData.readingProgress;
                    if (currentProgress === undefined) {
                        // Default to 0 if no progress information is available
                        currentProgress = 0;
                    }
                }
                
                const progressPercentage = typeof currentProgress === 'number' ? 
                    Math.min(100, Math.max(0, currentProgress * 100)) : // Convert 0-1 to percentage and clamp
                    (parseFloat(currentProgress) || 0);
                
                // Ask for new progress value
                const newProgressStr = prompt(
                    `Edit reading progress for "${bookTitle}"\n` +
                    `Current progress: ${progressPercentage.toFixed(1)}%\n` +
                    `Enter new progress (0-100%):`, 
                    progressPercentage.toFixed(1)
                );
                
                if (newProgressStr === null) {
                    return; // User cancelled
                }
                
                // Parse and validate new progress
                const newProgressPercentage = parseFloat(newProgressStr);
                if (isNaN(newProgressPercentage) || newProgressPercentage < 0 || newProgressPercentage > 100) {
                    alert('Invalid progress value. Please enter a number between 0 and 100.');
                    return;
                }
                
                // Convert percentage back to 0-1 scale for storage
                const newProgress = newProgressPercentage / 100;
                
                // Prepare update data
                const updateData = {
                    progress: newProgress,
                    lastReadAt: serverTimestamp()
                };
                
                // Add bookId if it was missing
                if (!stateData.bookId) {
                    updateData.bookId = bookId;
                }
                
                // Update the reading state
                await updateDoc(doc(getReadingStatesRef(userId), stateId), updateData);
                
                alert('Reading state updated successfully!');
                this.loadReadingStates();
            } else {
                alert('Reading state not found');
            }
        } catch (error) {
            console.error('Error editing reading state:', error);
            alert('Error editing reading state');
        }
    }

    async deleteReadingState(stateId, userId) {
        if (confirm('Are you sure you want to delete this reading state?')) {
            try {
                await deleteDoc(doc(getReadingStatesRef(userId), stateId));
                this.loadStats();
                this.loadReadingStates();
            } catch (error) {
                console.error('Error deleting reading state:', error);
                alert('Error deleting reading state');
            }
        }
    }

    // Subscription Plan Management
    async addSubscriptionPlan() {
        try {
            // Set the modal title and mode
            document.getElementById('subscription-modal-title').textContent = 'Add New Subscription Plan';
            document.getElementById('edit-subscription-mode').value = 'add';
            document.getElementById('edit-subscription-id').value = '';
            
            // Clear form
            document.getElementById('edit-subscription-form').reset();
            
            // Set defaults
            document.getElementById('edit-subscription-duration-type').value = 'month';
            document.getElementById('edit-subscription-active').checked = true;
            
            // Show the modal
            const modal = document.getElementById('edit-subscription-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            // Setup form submission
            this.setupSubscriptionFormSubmission();
        } catch (error) {
            console.error('Error preparing add subscription form:', error);
            alert('Error preparing add subscription form: ' + error.message);
        }
    }

    async editSubscriptionPlan(planId) {
        try {
            const planDoc = await getDoc(doc(subscriptionPlansRef, planId));
            if (planDoc.exists()) {
                // Set the modal title and mode
                document.getElementById('subscription-modal-title').textContent = 'Edit Subscription Plan';
                document.getElementById('edit-subscription-mode').value = 'edit';
                document.getElementById('edit-subscription-id').value = planId;
                
                const plan = planDoc.data();
                
                // Fill the form with current plan data
                document.getElementById('edit-subscription-name').value = plan.name || '';
                document.getElementById('edit-subscription-price').value = plan.price || 0;
                document.getElementById('edit-subscription-duration').value = plan.duration || 1;
                document.getElementById('edit-subscription-duration-type').value = plan.durationType || 'month';
                document.getElementById('edit-subscription-product-id').value = plan.stripeProductId || '';
                document.getElementById('edit-subscription-price-id').value = plan.stripePriceId || '';
                
                // Handle features (convert array to newline-separated string if needed)
                if (Array.isArray(plan.features)) {
                    document.getElementById('edit-subscription-features').value = plan.features.join('\n');
                } else if (typeof plan.features === 'string') {
                    document.getElementById('edit-subscription-features').value = plan.features;
                } else {
                    document.getElementById('edit-subscription-features').value = '';
                }
                
                document.getElementById('edit-subscription-active').checked = plan.active || false;
                document.getElementById('edit-subscription-featured').checked = plan.featured || false;

                // Show the modal
                const modal = document.getElementById('edit-subscription-modal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');

                // Setup form submission
                this.setupSubscriptionFormSubmission(plan);
            } else {
                alert('Subscription plan not found');
            }
        } catch (error) {
            console.error('Error editing subscription plan:', error);
            alert('Error editing subscription plan: ' + error.message);
        }
    }

    setupSubscriptionFormSubmission(existingPlan = null) {
        const form = document.getElementById('edit-subscription-form');
        const mode = document.getElementById('edit-subscription-mode').value;
        const planId = document.getElementById('edit-subscription-id').value;
        
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            // Get form values
            const name = document.getElementById('edit-subscription-name').value;
            const price = parseFloat(document.getElementById('edit-subscription-price').value);
            const duration = parseInt(document.getElementById('edit-subscription-duration').value);
            const durationType = document.getElementById('edit-subscription-duration-type').value;
            const stripeProductId = document.getElementById('edit-subscription-product-id').value;
            const stripePriceId = document.getElementById('edit-subscription-price-id').value;
            
            // Convert features from newline-separated to array
            let features = document.getElementById('edit-subscription-features').value;
            if (features) {
                features = features.split('\n').map(f => f.trim()).filter(f => f);
            }
            
            const active = document.getElementById('edit-subscription-active').checked;
            const featured = document.getElementById('edit-subscription-featured').checked;

            const planData = {
                name,
                price,
                duration,
                durationType,
                stripeProductId,
                stripePriceId,
                features,
                active,
                featured,
                updatedAt: serverTimestamp()
            };

            try {
                if (mode === 'add') {
                    // Add new fields specific to new plans
                    planData.createdAt = serverTimestamp();
                    planData.subscriberCount = 0;
                    
                    // Add the new plan to the database
                    await addDoc(subscriptionPlansRef, planData);
                    alert('Subscription plan added successfully!');
                } else {
                    // Keep existing fields
                    if (existingPlan) {
                        planData.createdAt = existingPlan.createdAt || serverTimestamp();
                        planData.subscriberCount = existingPlan.subscriberCount || 0;
                    }
                    
                    // Update the existing plan
                    await updateDoc(doc(subscriptionPlansRef, planId), planData);
                    alert('Subscription plan updated successfully!');
                }
                
                // Hide modal and reset form
                const modal = document.getElementById('edit-subscription-modal');
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                form.reset();
                
                // Reload subscription plans
                this.loadSubscriptionPlans();
            } catch (error) {
                console.error('Error saving subscription plan:', error);
                alert('Error saving subscription plan: ' + error.message);
            }
        };
    }

    async deleteSubscriptionPlan(planId) {
        if (confirm('Are you sure you want to delete this subscription plan? This will not affect current subscribers but they will not be able to renew with this plan.')) {
            try {
                await deleteDoc(doc(subscriptionPlansRef, planId));
                this.loadSubscriptionPlans();
            } catch (error) {
                console.error('Error deleting subscription plan:', error);
                alert('Error deleting subscription plan: ' + error.message);
            }
        }
    }

    async viewSubscriptionPlan(planId) {
        try {
            const planDoc = await getDoc(doc(subscriptionPlansRef, planId));
            if (planDoc.exists()) {
                const plan = planDoc.data();
                let featuresText = '';
                
                if (Array.isArray(plan.features)) {
                    featuresText = plan.features.join(', ');
                } else if (typeof plan.features === 'string') {
                    featuresText = plan.features;
                }
                
                const details = [
                    `Name: ${plan.name || 'N/A'}`,
                    `Price: $${(plan.price || 0).toFixed(2)}`,
                    `Duration: ${plan.duration || 1} ${plan.durationType || 'month'}(s)`,
                    `Features: ${featuresText || 'None'}`,
                    `Status: ${plan.active ? 'Active' : 'Inactive'}`,
                    `Featured: ${plan.featured ? 'Yes' : 'No'}`,
                    `Stripe Product ID: ${plan.stripeProductId || 'N/A'}`,
                    `Stripe Price ID: ${plan.stripePriceId || 'N/A'}`,
                    `Subscriber Count: ${plan.subscriberCount || 0}`
                ].join('\n');

                alert(`Subscription Plan Details:\n${details}`);
            } else {
                alert('Subscription plan not found');
            }
        } catch (error) {
            console.error('Error viewing subscription plan:', error);
            alert('Error viewing subscription plan: ' + error.message);
        }
    }

    // Subscriber Management
    async viewSubscriber(userId) {
        try {
            const userDoc = await getDoc(doc(usersRef, userId));
            if (userDoc.exists()) {
                const user = userDoc.data();
                const subscription = user.subscription || {};
                
                // Format dates
                const startDate = subscription.startDate ? 
                    (subscription.startDate.toDate ? subscription.startDate.toDate() : new Date(subscription.startDate)) 
                    : null;
                const endDate = subscription.endDate ? 
                    (subscription.endDate.toDate ? subscription.endDate.toDate() : new Date(subscription.endDate)) 
                    : null;
                
                const formattedStartDate = startDate ? startDate.toLocaleDateString() : 'N/A';
                const formattedEndDate = endDate ? endDate.toLocaleDateString() : 'N/A';
                
                // Get user name
                const userName = user.full_name || user.name || user.displayName || user.email || 'Unknown User';
                
                // Populate the subscriber detail modal content
                const detailContent = document.getElementById('subscriber-detail-content');
                detailContent.innerHTML = `
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">User</h4>
                        <p class="font-medium">${userName}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Email</h4>
                        <p>${user.email || 'N/A'}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Subscription Plan</h4>
                        <p>${subscription.plan || 'N/A'}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Status</h4>
                        <p><span class="px-2 py-1 text-sm rounded-full ${
                            subscription.status === 'active' ? 'bg-green-100 text-green-800' : 
                            subscription.status === 'cancelled' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-gray-100 text-gray-800'
                        }">${subscription.status || 'inactive'}</span></p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Start Date</h4>
                        <p>${formattedStartDate}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">End Date</h4>
                        <p>${formattedEndDate}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Payment Method</h4>
                        <p>${subscription.paymentMethod || 'N/A'}</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-500">Subscription ID</h4>
                        <p class="text-sm font-mono bg-gray-100 p-1 rounded">${subscription.subscriptionId || 'N/A'}</p>
                    </div>
                `;
                
                // Store the current user ID for action buttons
                this.currentSubscriberUserId = userId;
                
                // Show the modal
                const modal = document.getElementById('subscriber-detail-modal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            } else {
                alert('User not found');
            }
        } catch (error) {
            console.error('Error viewing subscriber:', error);
            alert('Error viewing subscriber: ' + error.message);
        }
    }

    async editSubscriber(userId) {
        try {
            const userDoc = await getDoc(doc(usersRef, userId));
            if (userDoc.exists()) {
                const user = userDoc.data();
                const subscription = user.subscription || {};
                
                // In a real implementation, you would display a more comprehensive form
                // For simplicity, we'll just allow changing the subscription end date
                const endDate = subscription.endDate ? 
                    (subscription.endDate.toDate ? subscription.endDate.toDate() : new Date(subscription.endDate)) 
                    : new Date();
                
                const formattedEndDate = endDate.toISOString().split('T')[0]; // Format for date input
                
                const newEndDateStr = prompt('Enter new subscription end date:', formattedEndDate);
                if (newEndDateStr) {
                    const newEndDate = new Date(newEndDateStr);
                    
                    // Update the subscription end date
                    await updateDoc(doc(usersRef, userId), {
                        'subscription.endDate': Timestamp.fromDate(newEndDate),
                        'subscription.updatedAt': serverTimestamp()
                    });
                    
                    alert('Subscription updated successfully!');
                    this.loadSubscribers();
                }
            } else {
                alert('User not found');
            }
        } catch (error) {
            console.error('Error editing subscriber:', error);
            alert('Error editing subscriber: ' + error.message);
        }
    }

    async cancelSubscription(userId) {
        if (confirm('Are you sure you want to cancel this user\'s subscription? This action cannot be undone.')) {
            try {
                // Get current user data
                const userDoc = await getDoc(doc(usersRef, userId));
                if (!userDoc.exists()) {
                    alert('User not found');
                    return;
                }
                
                const user = userDoc.data();
                if (!user.subscription || user.subscription.status !== 'active') {
                    alert('This user does not have an active subscription');
                    return;
                }
                
                // Update the subscription status
                await updateDoc(doc(usersRef, userId), {
                    'subscription.status': 'cancelled',
                    'subscription.cancelledAt': serverTimestamp(),
                    'subscription.updatedAt': serverTimestamp()
                });
                
                alert('Subscription cancelled successfully!');
                this.loadSubscribers();
            } catch (error) {
                console.error('Error cancelling subscription:', error);
                alert('Error cancelling subscription: ' + error.message);
            }
        }
    }

    async updateSubscriptionStatus() {
        if (!this.currentSubscriberUserId) {
            alert('No user selected');
            return;
        }
        
        try {
            const userDoc = await getDoc(doc(usersRef, this.currentSubscriberUserId));
            if (!userDoc.exists()) {
                alert('User not found');
                return;
            }
            
            const user = userDoc.data();
            const subscription = user.subscription || {};
            
            // Get all available subscription plans
            const plansSnapshot = await getDocs(query(subscriptionPlansRef, where('active', '==', true)));
            const plans = [];
            plansSnapshot.forEach(doc => {
                const plan = doc.data();
                plans.push({
                    id: doc.id,
                    name: plan.name,
                    price: plan.price,
                    duration: plan.duration,
                    durationType: plan.durationType
                });
            });
            
            if (plans.length === 0) {
                alert('No active subscription plans available');
                return;
            }
            
            // Create a select dropdown for plans
            let planOptions = '';
            plans.forEach(plan => {
                planOptions += `<option value="${plan.id}">${plan.name} - $${plan.price.toFixed(2)} for ${plan.duration} ${plan.durationType}(s)</option>`;
            });
            
            // Show a form for updating subscription
            const newStatus = prompt(
                `Current Status: ${subscription.status || 'inactive'}\n\n` +
                `Select new status:\n\n` +
                `1. active\n` +
                `2. cancelled\n` +
                `3. expired\n` +
                `Enter the number of your choice:`
            );
            
            if (newStatus) {
                let statusValue;
                switch (newStatus.trim()) {
                    case '1':
                        statusValue = 'active';
                        break;
                    case '2':
                        statusValue = 'cancelled';
                        break;
                    case '3':
                        statusValue = 'expired';
                        break;
                    default:
                        alert('Invalid selection');
                        return;
                }
                
                // Update the subscription status
                await updateDoc(doc(usersRef, this.currentSubscriberUserId), {
                    'subscription.status': statusValue,
                    'subscription.updatedAt': serverTimestamp()
                });
                
                alert('Subscription status updated successfully!');
                
                // Close the modal and reload subscribers
                const modal = document.getElementById('subscriber-detail-modal');
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                
                this.loadSubscribers();
            }
        } catch (error) {
            console.error('Error updating subscription status:', error);
            alert('Error updating subscription status: ' + error.message);
        }
    }

    // Cloudinary Integration
    initializeCloudinaryWidget() {
        // Initialize Cloudinary widgets
        const commonConfig = {
            cloudName: cloudinaryConfig.cloudName,
            uploadPreset: cloudinaryConfig.uploadPreset,
            folder: cloudinaryConfig.folder,
            secure: true,
            maxFileSize: 20000000, // 20MB
            showAdvancedOptions: false,
            cropping: false,
            showSkipCropButton: false,
            styles: {
                palette: {
                    window: "#FFFFFF",
                    windowBorder: "#90A0B3",
                    tabIcon: "#0078FF",
                    menuIcons: "#5A616A",
                    textDark: "#000000",
                    textLight: "#FFFFFF",
                    link: "#0078FF",
                    action: "#FF620C",
                    inactiveTabIcon: "#0E2F5A",
                    error: "#F44235",
                    inProgress: "#0078FF",
                    complete: "#20B832",
                    sourceBg: "#E4EBF1"
                }
            }
        };

        // Audio widget for page audio files
        this.audioWidget = window.cloudinary.createUploadWidget(
            {
                ...commonConfig,
                sources: ['local', 'url'],
                multiple: false,
                maxFiles: 1,
                resourceType: 'auto',
                clientAllowedFormats: ['mp3', 'wav', 'm4a', 'aac'],
                maxFileSize: 30000000, // 30MB for audio files
            },
            (error, result) => {
                if (error) {
                    console.error('Upload error:', error);
                    alert(`Error uploading audio: ${error.statusText || error.message || 'Unknown error'}`);
                    return;
                }
                if (result.event === "success") {
                    
                    const url = result.info.secure_url;
                    this.addAudioFileToList(url);
                }
            }
        );

        this.imageWidget = window.cloudinary.createUploadWidget(
            {
                ...commonConfig,
                sources: ['local', 'url', 'camera'],
                multiple: false,
                maxFiles: 1,
                resourceType: 'image',
                clientAllowedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
                maxImageFileSize: 10000000, // 10MB for images
            },
            (error, result) => {
                if (error) {
                    console.error('Upload error:', error);
                    alert(`Error uploading image: ${error.statusText || error.message || 'Unknown error'}`);
                    return;
                }
                if (result.event === "success") {
                    const url = result.info.secure_url;
                    const type = this.currentUploadType;
                    
                    if (type === 'genre-icon') {
                        document.getElementById('edit-genre-icon-url').value = url;
                    } else {
                        document.getElementById(`edit-book-${type}-url`).value = url;
                    }
                    alert('Image uploaded successfully!');
                }
            }
        );

        this.pdfWidget = window.cloudinary.createUploadWidget(
            {
                ...commonConfig,
                sources: ['local', 'url'],
                multiple: false,
                maxFiles: 1,
                resourceType: 'auto',
                clientAllowedFormats: ['pdf'],
                maxFileSize: 50000000, // 50MB for PDFs
            },
            (error, result) => {
                if (error) {
                    console.error('Upload error:', error);
                    alert(`Error uploading PDF: ${error.statusText || error.message || 'Unknown error'}`);
                    return;
                }
                if (result.event === "success") {
                    const url = result.info.secure_url.replace('/raw/upload/', '/upload/');
                    document.getElementById('edit-book-pdf-url').value = url;
                    alert('PDF uploaded successfully!');
                }
            }
        );
    }

    uploadImage(type) {
        this.currentUploadType = type;
        this.imageWidget.open();
    }

    uploadFile(type) {
        if (type === 'pdf') {
            this.pdfWidget.open();
        } else if (type === 'audio') {
            this.currentPage = prompt('Enter the page number for this audio:');
            if (this.currentPage && !isNaN(this.currentPage)) {
                this.audioWidget.open();
            }
        }
    }

    addAudioFileToList(url) {
        const container = document.getElementById('audio-files-container');
        const pageNum = this.currentPage;
        
        // Create audio file entry
        const entry = document.createElement('div');
        entry.className = 'flex items-center justify-between p-2 border rounded';
        entry.dataset.page = pageNum;
        entry.dataset.url = url;
        
        // Audio preview and page number
        entry.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="font-medium">Page ${pageNum}</span>
                <audio controls class="h-8">
                    <source src="${url}" type="audio/mpeg">
                </audio>
            </div>
            <button type="button" onclick="this.parentElement.remove()"
                    class="text-red-600 hover:text-red-800">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(entry);
        document.getElementById('edit-book-has-audio').checked = true;
    }

    getAudioFilesMap() {
        const container = document.getElementById('audio-files-container');
        if (!container) return {};
        
        const audioMap = {};
        
        Array.from(container.children).forEach(entry => {
            const page = entry.dataset.page;
            const url = entry.dataset.url;
            if (page && url) {
                audioMap[page] = url;
            }
        });
        
        return audioMap;
    }

    // Fix reading states by adding missing fields
    async fixReadingStates() {
        try {
            console.log("=== FIXING READING STATES ===");
            
            // Get all users
            const usersSnapshot = await getDocs(usersRef);
            console.log(`Found ${usersSnapshot.docs.length} users`);
            
            let totalFixed = 0;
            let totalErrors = 0;
            
            // Check each user's reading states
            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const userData = userDoc.data();
                console.log(`Checking reading states for user: ${userId} (${userData.email || userData.name || 'Unknown'})`);
                
                const userReadingStatesRef = getReadingStatesRef(userId);
                if (!userReadingStatesRef) {
                    console.log(`  No reading states reference for user: ${userId}`);
                    continue;
                }
                
                try {
                    const userReadingStatesSnapshot = await getDocs(userReadingStatesRef);
                    console.log(`  Found ${userReadingStatesSnapshot.docs.length} reading states`);
                    
                    for (const stateDoc of userReadingStatesSnapshot.docs) {
                        const stateData = stateDoc.data();
                        const stateId = stateDoc.id;
                        
                        // Check for missing fields
                        const updates = {};
                        let needsUpdate = false;
                        
                        // Fix bookId if missing
                        if (!stateData.bookId) {
                            updates.bookId = stateId;
                            needsUpdate = true;
                        }
                        
                        // Fix progress if missing but readingProgress exists
                        if (stateData.progress === undefined && stateData.readingProgress !== undefined) {
                            updates.progress = stateData.readingProgress;
                            needsUpdate = true;
                        }
                        
                        // Fix userId if missing
                        if (!stateData.userId) {
                            updates.userId = userId;
                            needsUpdate = true;
                        }
                        
                        // Update the document if needed
                        if (needsUpdate) {
                            try {
                                console.log(`  - Fixing reading state ${stateId} with updates:`, updates);
                                await updateDoc(doc(userReadingStatesRef, stateId), updates);
                                totalFixed++;
                                console.log(`    ✓ Fixed successfully`);
                            } catch (error) {
                                console.error(`    ✗ Error updating reading state:`, error);
                                totalErrors++;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`  Error fetching reading states for user ${userId}:`, error);
                    totalErrors++;
                }
            }
            
            console.log(`=== FINISHED FIXING READING STATES ===`);
            console.log(`Total fixed: ${totalFixed}, Total errors: ${totalErrors}`);
            
            alert(`Reading states fix completed!\nFixed: ${totalFixed}\nErrors: ${totalErrors}\n\nCheck console for details.`);
            
            // Reload reading states to show the fixed data
            this.loadReadingStates();
        } catch (error) {
            console.error('Error fixing reading states:', error);
            alert('Error fixing reading states: ' + error.message);
        }
    }

    // Notification Methods
    async loadNotifications() {
        try {
            const notificationsQuery = query(notificationsRef, orderBy('createdAt', 'desc'), limit(20));
            const snapshot = await getDocs(notificationsQuery);
            
            const notificationsTable = document.getElementById('notifications-table');
            if (!notificationsTable) return;
            
            notificationsTable.innerHTML = '';
            
            if (snapshot.empty) {
                notificationsTable.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-4 text-center text-gray-500">No notifications found</td>
                    </tr>
                `;
                return;
            }
            
            snapshot.forEach(doc => {
                const notification = doc.data();
                const row = document.createElement('tr');
                
                let sentTo = 'All Users';
                if (notification.topic) {
                    sentTo = `Topic: ${notification.topic}`;
                } else if (notification.userId) {
                    sentTo = `User: ${notification.userName || notification.userId}`;
                }
                
                row.innerHTML = `
                    <td class="py-2">${notification.title || 'No Title'}</td>
                    <td class="py-2">${notification.type || 'N/A'}</td>
                    <td class="py-2">${sentTo}</td>
                    <td class="py-2">${notification.createdAt ? formatDate(notification.createdAt.toDate()) : 'N/A'}</td>
                    <td class="py-2 text-right">
                        <button onclick="dashboardManager.viewNotification('${doc.id}')" class="text-blue-600 hover:text-blue-800 mr-2">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="dashboardManager.resendNotification('${doc.id}')" class="text-green-600 hover:text-green-800 mr-2">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button onclick="dashboardManager.deleteNotification('${doc.id}')" class="text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                
                notificationsTable.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading notifications:', error);
            alert('Failed to load notifications. See console for details.');
        }
    }
    
    async loadNotificationTokens() {
        try {
            const usersSnapshot = await getDocs(query(usersRef, limit(20)));
            const tokensTable = document.getElementById('notification-tokens-table');
            if (!tokensTable) return;
            
            tokensTable.innerHTML = '';
            
            let hasTokens = false;
            
            for (const userDoc of usersSnapshot.docs) {
                const userData = userDoc.data();
                const userId = userDoc.id;
                
                const tokensQuery = collection(db, 'users', userId, 'tokens');
                const tokensSnapshot = await getDocs(tokensQuery);
                
                if (!tokensSnapshot.empty) {
                    hasTokens = true;
                    
                    tokensSnapshot.forEach(tokenDoc => {
                        const tokenData = tokenDoc.data();
                        const row = document.createElement('tr');
                        
                        row.innerHTML = `
                            <td class="py-2">${userData.displayName || userData.email || 'Unknown User'}</td>
                            <td class="py-2">${tokenData.platform || 'Unknown'} ${tokenData.deviceInfo?.osVersion || ''}</td>
                            <td class="py-2">
                                <div class="flex items-center">
                                    <span class="truncate max-w-xs">${tokenData.token?.substring(0, 20) || 'No Token'}...</span>
                                    <button onclick="navigator.clipboard.writeText('${tokenData.token || ''}').then(() => alert('Token copied!'))" 
                                            class="ml-2 text-blue-600 hover:text-blue-800">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </td>
                            <td class="py-2">${tokenData.updatedAt ? formatDate(tokenData.updatedAt.toDate()) : 'N/A'}</td>
                            <td class="py-2 text-right">
                                <button onclick="dashboardManager.sendNotificationToToken('${tokenData.token}')" class="text-blue-600 hover:text-blue-800 mr-2">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                                <button onclick="dashboardManager.deleteToken('${userId}', '${tokenDoc.id}')" class="text-red-600 hover:text-red-800">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        `;
                        
                        tokensTable.appendChild(row);
                    });
                }
            }
            
            if (!hasTokens) {
                tokensTable.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-4 text-center text-gray-500">No notification tokens found</td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('Error loading notification tokens:', error);
            alert('Failed to load notification tokens. See console for details.');
        }
    }
    
    async populateUserDropdown() {
        try {
            const usersSnapshot = await getDocs(usersRef);
            const userSelect = document.getElementById('notification-user');
            if (!userSelect) return;
            
            userSelect.innerHTML = '';
            
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = userData.displayName || userData.email || doc.id;
                userSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating user dropdown:', error);
            alert('Failed to load users. See console for details.');
        }
    }
    
    showSendNotificationForm() {
        document.getElementById('send-notification-form').classList.remove('hidden');
    }
    
    hideSendNotificationForm() {
        document.getElementById('send-notification-form').classList.add('hidden');
    }
    
    async sendNotification() {
        try {
            const type = document.getElementById('notification-type').value;
            const title = document.getElementById('notification-title').value;
            const message = document.getElementById('notification-message').value;
            const category = document.getElementById('notification-category').value;
            let additionalData = document.getElementById('notification-data').value;
            
            if (!title || !message) {
                alert('Title and message are required');
                return;
            }
            
            // Parse additional data if provided
            let data = {};
            if (additionalData) {
                try {
                    data = JSON.parse(additionalData);
                } catch (e) {
                    alert('Invalid JSON in additional data field');
                    return;
                }
            }
            
            // Add category to data
            data.type = category;
            
            // Prepare notification data
            const notificationData = {
                title,
                body: message,
                data
            };
            
            // Add target based on type
            if (type === 'topic') {
                const topic = document.getElementById('notification-topic').value;
                notificationData.topic = topic;
                
                // Save to Firestore
                await addDoc(notificationsRef, {
                    title,
                    message,
                    type: category,
                    topic,
                    data,
                    createdAt: serverTimestamp()
                });
                
                // Call Firebase Function to send notification
                const result = await sendNotification({
                    ...notificationData,
                    to: `/topics/${topic}`
                });
                
                console.log('Notification sent to topic:', result);
                alert(`Notification sent to topic: ${topic}`);
            } else if (type === 'specific') {
                const userId = document.getElementById('notification-user').value;
                
                // Get user token
                const tokensSnapshot = await getDocs(collection(db, 'users', userId, 'tokens'));
                
                if (tokensSnapshot.empty) {
                    alert('Selected user has no notification tokens');
                    return;
                }
                
                const tokenDoc = tokensSnapshot.docs[0];
                const token = tokenDoc.data().token;
                
                if (!token) {
                    alert('Selected user has no valid notification token');
                    return;
                }
                
                // Get user data for name
                const userDoc = await getDoc(doc(db, 'users', userId));
                const userData = userDoc.data();
                
                // Save to Firestore
                await addDoc(notificationsRef, {
                    title,
                    message,
                    type: category,
                    userId,
                    userName: userData?.displayName || userData?.email,
                    data,
                    createdAt: serverTimestamp()
                });
                
                // Also save to user's notifications collection
                await addDoc(collection(db, 'users', userId, 'notifications'), {
                    title,
                    message,
                    type: category,
                    isRead: false,
                    data,
                    createdAt: serverTimestamp()
                });
                
                // Call Firebase Function to send notification
                const result = await sendNotification({
                    ...notificationData,
                    token
                });
                
                console.log('Notification sent to user:', result);
                alert(`Notification sent to user: ${userData?.displayName || userData?.email || userId}`);
            } else {
                // Send to all users
                // Save to Firestore
                await addDoc(notificationsRef, {
                    title,
                    message,
                    type: category,
                    data,
                    createdAt: serverTimestamp()
                });
                
                // Call Firebase Function to send notification to all
                const result = await sendNotification({
                    ...notificationData,
                    to: '/topics/all'
                });
                
                console.log('Notification sent to all users:', result);
                alert('Notification sent to all users');
            }
            
            // Reset form and hide it
            document.getElementById('notification-form').reset();
            this.hideSendNotificationForm();
            
            // Reload notifications
            await this.loadNotifications();
        } catch (error) {
            console.error('Error sending notification:', error);
            alert('Failed to send notification. See console for details.');
        }
    }
    
    async viewNotification(notificationId) {
        try {
            const notificationDoc = await getDoc(doc(notificationsRef, notificationId));
            if (!notificationDoc.exists()) {
                alert('Notification not found');
                return;
            }
            
            const notification = notificationDoc.data();
            
            let sentTo = 'All Users';
            if (notification.topic) {
                sentTo = `Topic: ${notification.topic}`;
            } else if (notification.userId) {
                sentTo = `User: ${notification.userName || notification.userId}`;
            }
            
            alert(`
Title: ${notification.title}
Message: ${notification.message}
Type: ${notification.type || 'N/A'}
Sent To: ${sentTo}
Date: ${notification.createdAt ? formatDate(notification.createdAt.toDate()) : 'N/A'}
Data: ${JSON.stringify(notification.data || {}, null, 2)}
            `);
        } catch (error) {
            console.error('Error viewing notification:', error);
            alert('Failed to view notification. See console for details.');
        }
    }
    
    async resendNotification(notificationId) {
        try {
            const notificationDoc = await getDoc(doc(notificationsRef, notificationId));
            if (!notificationDoc.exists()) {
                alert('Notification not found');
                return;
            }
            
            const notification = notificationDoc.data();
            
            // Prepare notification data
            const notificationData = {
                title: notification.title,
                body: notification.message,
                data: notification.data || {}
            };
            
            // Add target based on type
            if (notification.topic) {
                const result = await sendNotification({
                    ...notificationData,
                    to: `/topics/${notification.topic}`
                });
                
                console.log('Notification resent to topic:', result);
                alert(`Notification resent to topic: ${notification.topic}`);
            } else if (notification.userId) {
                // Get user token
                const tokensSnapshot = await getDocs(collection(db, 'users', notification.userId, 'tokens'));
                
                if (tokensSnapshot.empty) {
                    alert('User has no notification tokens');
                    return;
                }
                
                const tokenDoc = tokensSnapshot.docs[0];
                const token = tokenDoc.data().token;
                
                if (!token) {
                    alert('User has no valid notification token');
                    return;
                }
                
                // Call Firebase Function to send notification
                const result = await sendNotification({
                    ...notificationData,
                    token
                });
                
                console.log('Notification resent to user:', result);
                alert(`Notification resent to user: ${notification.userName || notification.userId}`);
            } else {
                // Resend to all users
                const result = await sendNotification({
                    ...notificationData,
                    to: '/topics/all'
                });
                
                console.log('Notification resent to all users:', result);
                alert('Notification resent to all users');
            }
        } catch (error) {
            console.error('Error resending notification:', error);
            alert('Failed to resend notification. See console for details.');
        }
    }
    
    async deleteNotification(notificationId) {
        if (!confirm('Are you sure you want to delete this notification?')) {
            return;
        }
        
        try {
            await deleteDoc(doc(notificationsRef, notificationId));
            alert('Notification deleted successfully');
            await this.loadNotifications();
        } catch (error) {
            console.error('Error deleting notification:', error);
            alert('Failed to delete notification. See console for details.');
        }
    }
    
    async sendNotificationToToken(token) {
        try {
            const title = prompt('Enter notification title:');
            if (!title) return;
            
            const message = prompt('Enter notification message:');
            if (!message) return;
            
            const result = await sendNotification({
                title,
                body: message,
                data: { type: 'custom' },
                token
            });
            
            console.log('Notification sent to token:', result);
            alert('Notification sent successfully');
        } catch (error) {
            console.error('Error sending notification to token:', error);
            alert('Failed to send notification. See console for details.');
        }
    }
    
    async deleteToken(userId, tokenId) {
        if (!confirm('Are you sure you want to delete this token?')) {
            return;
        }
        
        try {
            await deleteDoc(doc(db, 'users', userId, 'tokens', tokenId));
            alert('Token deleted successfully');
            await this.loadNotificationTokens();
        } catch (error) {
            console.error('Error deleting token:', error);
            alert('Failed to delete token. See console for details.');
        }
    }
}

// Initialize dashboard
window.dashboardManager = new DashboardManager();
